# Issuing, looking up and accepting team invitations (spec decision 7).
#
# Tokens are random, stored only as SHA-256 digests, expire after seven days and are single
# use. There is no email provider yet: the create response carries the `accept_url` and the
# mailer renders locally; wiring real SMTP is a non-goal.
module Signup
  module Invitations
    TTL = 7.days

    # A validation failure the controller renders as an error envelope (unknown coordinator
    # also carries the list of names that would have been accepted).
    class Error < StandardError
      attr_reader :code, :valid_names

      def initialize(code, message, valid_names: nil)
        @code = code
        @valid_names = valid_names
        super(message)
      end
    end

    # The token is expired or already used → 410, never 404 (the link is real, just spent).
    class Expired < StandardError; end

    # The raw token is never persisted: it is encrypted into the job payload so the mail can
    # rebuild the link, without the usable token ever reaching job arguments or logs.
    SEAL_PURPOSE = "invitation accept url"
    SEAL_TTL = 1.hour

    class << self
      # Returns [invitation, raw_token]; the raw token is never stored.
      def issue!(agency:, invited_by:, email:, coordinator_name:)
        names = coordinator_names
        unless names.include?(coordinator_name.to_s)
          raise Error.new("unknown_coordinator", "Pick an existing coordinator", valid_names: names)
        end
        unless email.to_s.strip.match?(URI::MailTo::EMAIL_REGEXP)
          raise Error.new("invalid_email", "Enter a valid email address")
        end

        raw_token = SecureRandom.urlsafe_base64(32)
        invitation = Invitation.create!(
          agency: agency,
          invited_by: invited_by,
          email: email.to_s.strip,
          role: "coordinator",
          coordinator_name: coordinator_name,
          token_digest: digest(raw_token),
          expires_at: TTL.from_now
        )
        [ invitation, raw_token ]
      end

      # Public lookup by token. The token itself names the tenant, so this is the one query
      # that cannot be agency-scoped up front (docs/conventions/multi-tenancy.md, rule 1):
      # read the agency id by digest, then load the invitation inside that agency's context.
      def find_by_token(token)
        return if token.blank?

        digest = digest(token)
        agency_id = Invitation.connection.select_value(
          Invitation.sanitize_sql_array([ "SELECT agency_id FROM invitations WHERE token_digest = ?", digest ])
        )
        return if agency_id.blank?

        Current.set(agency: Agency.find(agency_id)) do
          Invitation.find_by(token_digest: digest)
        end
      end

      def usable?(invitation)
        invitation.accepted_at.nil? && invitation.expires_at.future?
      end

      # Accepting creates the coordinator, marks the invitation used and signs the user in.
      # Requires Current.agency to be the invitation's agency for AgencyScoped.
      def accept!(invitation, name:, password:)
        if password.to_s.length < CreateAgency::MINIMUM_PASSWORD_LENGTH
          raise Error.new("weak_password", "Password must be at least #{CreateAgency::MINIMUM_PASSWORD_LENGTH} characters")
        end

        User.transaction do
          invitation.lock!
          raise Expired unless usable?(invitation)

          user = User.create!(
            agency: invitation.agency,
            name: name,
            email: invitation.email,
            password: password,
            role: "coordinator",
            coordinator_name: invitation.coordinator_name
          )
          invitation.update!(accepted_at: Time.current)
          user
        end
      rescue ActiveRecord::RecordInvalid => e
        if e.record.is_a?(User) && e.record.errors.of_kind?(:email, :taken)
          raise Error.new("email_taken", "That email already has an account")
        end

        raise Error.new("invalid_invitation", e.record.errors.full_messages.to_sentence)
      rescue ActiveRecord::RecordNotUnique
        # A concurrent accept (or a signup racing it) hits the users.email unique index
        # instead of a validation error; it is the same outcome as a taken email.
        raise Error.new("email_taken", "That email already has an account")
      end

      def accept_url(raw_token)
        "#{ENV.fetch('APP_URL', 'http://localhost:5173')}/invite/#{raw_token}"
      end

      # Job-safe token hand-off: opaque ciphertext, short lived, not usable to accept.
      def seal_token(raw_token)
        token_encryptor.encrypt_and_sign(raw_token, expires_in: SEAL_TTL)
      end

      def unseal_token(sealed)
        token_encryptor.decrypt_and_verify(sealed)
      end

      def token_encryptor
        @token_encryptor ||= ActiveSupport::MessageEncryptor.new(
          Rails.application.key_generator.generate_key(SEAL_PURPOSE, 32),
          cipher: "aes-256-gcm",
          serializer: JSON
        )
      end

      # The Invitation contract shape; `accept_url` only exists in the create response.
      def as_json(invitation, accept_url: nil)
        {
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          coordinator_name: invitation.coordinator_name,
          status: status(invitation),
          expires_at: invitation.expires_at.iso8601(3),
          accept_url: accept_url
        }.compact
      end

      def status(invitation)
        return "accepted" if invitation.accepted_at

        invitation.expires_at.future? ? "pending" : "expired"
      end

      def digest(token) = OpenSSL::Digest::SHA256.hexdigest(token)

      # The names present in this agency's leads; the invite picker offers exactly these.
      def coordinator_names
        Lead.distinct.order(:coordinator_name).pluck(:coordinator_name).compact
      end
    end
  end
end

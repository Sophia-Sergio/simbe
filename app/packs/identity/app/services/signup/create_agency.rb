# Creates a brand-new agency and its owner in one transaction (spec decision 1).
#
# The wizard collects the account and agency steps client-side and submits both here at the
# end of step 2; the remaining steps run authenticated. Nothing is shared with an existing
# agency, so the new owner never sees another tenant's data.
module Signup
  class CreateAgency
    # A validation failure the controller maps to a 422 error envelope. `code` is the
    # machine-readable value the frontend switches on (docs/conventions/controllers.md).
    class Error < StandardError
      attr_reader :code

      def initialize(code, message)
        @code = code
        super(message)
      end
    end

    # The four zones offered in the wizard (spec decision 2); stored as IANA identifiers.
    TIMEZONES = %w[
      America/Los_Angeles
      America/Denver
      America/Chicago
      America/New_York
    ].freeze

    MINIMUM_PASSWORD_LENGTH = 10

    def self.call(user_params:, agency_params:)
      new(user_params:, agency_params:).call
    end

    def initialize(user_params:, agency_params:)
      @user = user_params.to_h.symbolize_keys
      @agency = agency_params.to_h.symbolize_keys
    end

    # Returns the created owner (with `agency` loaded through the belongs_to).
    def call
      validate_password!
      validate_agency!

      User.transaction do
        agency = Agency.create!(
          name: @agency[:name].to_s.strip,
          slug: unique_slug(@agency[:name]),
          timezone: @agency[:timezone],
          qualified_milestone: @agency[:qualified_milestone]
        )
        User.create!(
          agency: agency,
          name: @user[:name],
          email: @user[:email],
          password: @user[:password],
          role: "owner"
        )
      end
    rescue ActiveRecord::RecordInvalid => e
      raise translated_error(e)
    rescue ActiveRecord::RecordNotUnique
      # The unique indexes are email and slug. A concurrent signup with the same email is
      # `email_taken`; a concurrent slug race is retried by the user (never a 500).
      if User.exists?(email: @user[:email])
        raise Error.new("email_taken", "That email already has an account")
      end

      raise Error.new("invalid_agency", "That agency name was just taken — try again")
    end

    private

    def validate_password!
      return if @user[:password].to_s.length >= MINIMUM_PASSWORD_LENGTH

      raise Error.new("weak_password", "Password must be at least #{MINIMUM_PASSWORD_LENGTH} characters")
    end

    def validate_agency!
      timezone_bad = !TIMEZONES.include?(@agency[:timezone].to_s)
      milestone_bad = !Agency::MILESTONES.include?(@agency[:qualified_milestone].to_s)
      return unless timezone_bad || milestone_bad

      raise Error.new("invalid_agency", agency_input_message(timezone: timezone_bad, milestone: milestone_bad))
    end

    # Names only the inputs that are missing or unsupported; the wizard shows each part under its input.
    def agency_input_message(timezone:, milestone:)
      if timezone && milestone
        "Pick a supported time zone and a definition of qualified"
      elsif timezone
        "Pick a supported time zone"
      else
        "Pick a definition of qualified"
      end
    end

    # Parameterized name, falling back to a random slug for names that parameterize to nothing
    # (`"!!!"`), then a numeric suffix while the slug is taken (`harbor`, `harbor-2`, …).
    # `parameterize` keeps underscores, but the slug format is [a-z0-9-] (`Agency`), so underscores
    # become spaces first: `faker_agency` -> `faker-agency`.
    def unique_slug(name)
      base = name.to_s.tr("_", " ").parameterize.presence || "agency-#{SecureRandom.alphanumeric(6).downcase}"
      candidate = base
      suffix = 2
      while Agency.exists?(slug: candidate)
        candidate = "#{base}-#{suffix}"
        suffix += 1
      end
      candidate
    end

    def translated_error(error)
      if error.record.is_a?(User) && error.record.errors.of_kind?(:email, :taken)
        Error.new("email_taken", "That email already has an account")
      elsif error.record.is_a?(User)
        # A validation failure the frontend cannot act on (blank name, …) is still a bad
        # signup payload rather than an agency conflict; keep the closed set of codes.
        Error.new("invalid_agency", "Check the account and agency details")
      else
        Error.new("invalid_agency", agency_error_message(error.record))
      end
    end

    # The message names what actually failed: the wizard shows it under the agency name field, so
    # blaming the time zone for a bad name (or slug) sends the user to the wrong place.
    def agency_error_message(agency)
      if agency.errors.include?(:name)
        "Enter an agency name"
      elsif agency.errors.include?(:slug)
        "That agency name can't be used - try a different one"
      elsif agency.errors.include?(:timezone) || agency.errors.include?(:qualified_milestone)
        agency_input_message(timezone: agency.errors.include?(:timezone), milestone: agency.errors.include?(:qualified_milestone))
      else
        "Check the agency details"
      end
    end
  end
end

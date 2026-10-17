# Delivers the invitation email in the background (spec decision 7).
#
# Arguments are deliberately non-sensitive: the invitation id, its agency id and the sealed
# (short-lived ciphertext) token. Solid Queue persists job arguments in plaintext and
# ActiveJob logs them, so the raw token must never be one of them.
module Signup
  class InvitationDeliveryJob < ApplicationJob
    self.log_arguments = false

    discard_on ActiveRecord::RecordNotFound
    discard_on ActiveSupport::MessageEncryptor::InvalidMessage

    def perform(invitation_id, agency_id, sealed_token)
      raw_token = Signup::Invitations.unseal_token(sealed_token)
      Current.set(agency: Agency.find(agency_id)) do
        invitation = Invitation.find(invitation_id)
        next unless Signup::Invitations.usable?(invitation) # revoked/expired: nothing to send

        InvitationMailer.invite(
          email: invitation.email,
          agency_name: invitation.agency.name,
          coordinator_name: invitation.coordinator_name,
          accept_url: Signup::Invitations.accept_url(raw_token)
        ).deliver_now
      end
    end
  end
end

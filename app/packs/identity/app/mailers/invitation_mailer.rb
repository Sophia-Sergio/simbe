# Invitation email (spec decision 7). No provider yet: test keeps deliveries in memory, dev
# uses Rails' default behaviour, and the API response also returns `accept_url`.
#
# The mailer takes plain values on purpose: Invitation is AgencyScoped, so handing the record
# to `deliver_later` would make the background job locate it without `Current.agency` and
# raise Agency::MissingContext. No provider/token ever goes in the message body beyond the link.
class InvitationMailer < ApplicationMailer
  def invite(email:, agency_name:, coordinator_name:, accept_url:)
    @email = email
    @agency_name = agency_name
    @coordinator_name = coordinator_name
    @accept_url = accept_url

    mail(to: email, subject: "You're invited to #{agency_name} on Simbe")
  end
end

# Invitation email (spec decision 7). No provider yet: dev renders it with letter_opener,
# test keeps it in ActionMailer::Base.deliveries, and the API response also returns accept_url.
class InvitationMailer < ApplicationMailer
  def invite(invitation, accept_url)
    @invitation = invitation
    @accept_url = accept_url
    @agency = invitation.agency

    mail(to: invitation.email, subject: "You're invited to #{@agency.name} on Simbe")
  end
end

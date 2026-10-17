module Api
  module V1
    # Team invitations (spec decision 7). Owners create/revoke; the preview and accept actions
    # are public because the invited coordinator has no session yet.
    class InvitationsController < Api::BaseController
      skip_before_action :authenticate!, only: %i[preview accept]
      before_action :load_invitation, only: %i[preview accept]
      before_action :require_owner!, only: %i[create destroy]

      def create
        invitation, raw_token = Signup::Invitations.issue!(
          agency: Current.agency,
          invited_by: Current.user,
          email: params[:email].to_s,
          coordinator_name: params[:coordinator_name].to_s
        )
        url = Signup::Invitations.accept_url(raw_token)
        # The job gets opaque, short-lived ciphertext, never the usable token.
        Signup::InvitationDeliveryJob.perform_later(
          invitation.id,
          invitation.agency_id,
          Signup::Invitations.seal_token(raw_token)
        )
        render json: Signup::Invitations.as_json(invitation, accept_url: url), status: :created
      rescue Signup::Invitations::Error => e
        render_invitation_error(e)
      end

      def destroy
        Current.agency.invitations.find(params[:id]).destroy
        head :no_content
      end

      def preview
        return render_expired unless Signup::Invitations.usable?(@invitation)

        render json: {
          agency_name: @invitation.agency.name,
          email: @invitation.email,
          coordinator_name: @invitation.coordinator_name
        }
      end

      def accept
        return render_expired unless Signup::Invitations.usable?(@invitation)

        user = Signup::Invitations.accept!(
          @invitation,
          name: params[:name].to_s,
          password: params[:password].to_s
        )
        start_session(user)
        render json: MeSerializer.call(user), status: :created
      rescue Signup::Invitations::Expired
        render_expired
      rescue Signup::Invitations::Error => e
        render_error(e.code, e.message, :unprocessable_entity)
      end

      private

      # The token names the tenant, so the lookup sets Current.agency for the rest of the
      # public action (BaseController resets Current after every request).
      def load_invitation
        @invitation = Signup::Invitations.find_by_token(params[:token])
        return render_expired unless @invitation

        Current.agency = @invitation.agency
      end

      def render_expired
        render_error("invitation_expired", "This invitation has expired", :gone)
      end

      def render_invitation_error(error)
        body = { error: { code: error.code, message: error.message } }
        body[:valid_names] = error.valid_names if error.valid_names
        render json: body, status: :unprocessable_entity
      end

      # Mirrors SessionsController#create: same HttpOnly cookie and 14-day session.
      def start_session(user)
        token = AuthSession.issue!(user)
        cookies.signed[:simbe_session] = {
          value: token,
          httponly: true,
          same_site: :lax,
          secure: Rails.env.production?,
          expires: AuthSession::TTL.from_now
        }
      end
    end
  end
end

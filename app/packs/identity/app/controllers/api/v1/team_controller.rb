module Api
  module V1
    # GET /team (owner only): the agency's users and its non-accepted invitations.
    class TeamController < Api::BaseController
      before_action :require_owner!

      def show
        render json: {
          users: Current.agency.users.order(:created_at).map { |user| user_json(user) },
          invitations: Current.agency.invitations.where(accepted_at: nil).order(:created_at)
                                .map { |invitation| Signup::Invitations.as_json(invitation) }
        }
      end

      private

      # Explicit attribute list (docs/conventions/controllers.md); matches the User contract.
      def user_json(user)
        {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          coordinator_name: user.coordinator_name
        }
      end
    end
  end
end

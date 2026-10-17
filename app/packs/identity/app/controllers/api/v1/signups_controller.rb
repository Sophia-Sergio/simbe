module Api
  module V1
    # Public signup (spec decision 1): creates the agency and its owner, signs the owner in and
    # returns the Me payload. CSRF header still required by Api::BaseController.
    class SignupsController < Api::BaseController
      skip_before_action :authenticate!

      def create
        user = Signup::CreateAgency.call(
          user_params: nested(:user, :name, :email, :password),
          agency_params: nested(:agency, :name, :timezone, :qualified_milestone)
        )
        start_session(user)
        render json: MeSerializer.call(user), status: :created
      rescue Signup::CreateAgency::Error => e
        render_error(e.code, e.message, :unprocessable_entity)
      end

      private

      # A missing section is an empty payload (mapped to a 422 by the service), never a 400.
      def nested(key, *attributes)
        params.fetch(key) { ActionController::Parameters.new }.permit(*attributes)
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

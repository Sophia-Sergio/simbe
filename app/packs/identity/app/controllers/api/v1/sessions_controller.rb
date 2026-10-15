module Api
  module V1
    class SessionsController < Api::BaseController
      skip_before_action :authenticate!, only: :create

      def create
        user = User.find_by(email: params[:email].to_s.strip.downcase)
        unless user&.authenticate(params[:password].to_s)
          return render_error("invalid_credentials", "Email or password is incorrect", :unauthorized)
        end

        token = AuthSession.issue!(user)
        cookies.signed[:simbe_session] = {
          value: token,
          httponly: true,
          same_site: :lax,
          secure: Rails.env.production?,
          expires: AuthSession::TTL.from_now
        }
        render json: MeSerializer.call(user), status: :created
      end

      def destroy
        AuthSession.find_by_token(cookies.signed[:simbe_session])&.destroy
        cookies.delete(:simbe_session)
        head :no_content
      end
    end
  end
end

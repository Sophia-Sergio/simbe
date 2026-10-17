module Api
  class BaseController < ActionController::API
    include ActionController::Cookies

    before_action :require_csrf_header!
    before_action :authenticate!
    after_action { Current.reset }

    rescue_from ActiveRecord::RecordNotFound do
      render_error("not_found", "Not found", :not_found)
    end
    rescue_from Agency::MissingContext do
      render_error("unauthenticated", "Sign in required", :unauthorized)
    end

    private

    def require_csrf_header!
      return if request.get? || request.head?
      return if request.headers["X-Requested-With"] == "simbe"

      render_error("csrf", "Missing X-Requested-With header", :forbidden)
    end

    def authenticate!
      session = AuthSession.find_by_token(cookies.signed[:simbe_session])
      return render_error("unauthenticated", "Sign in required", :unauthorized) unless session

      Current.user = session.user
      Current.agency = session.user.agency
    end

    def require_owner!
      render_error("forbidden", "Owner access required", :forbidden) unless Current.user.owner?
    end

    def render_error(code, message, status)
      render json: { error: { code: code, message: message } }, status: status
    end
  end
end

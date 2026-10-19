module Api
  module V1
    # Owner-only recommendations (docs/conventions: they reference channel performance).
    class RecommendationsController < Api::BaseController
      before_action :require_owner!

      rescue_from Metrics::BadRange do
        render_error("bad_range", "range must be one of 30d, 90d or 12m", :unprocessable_entity)
      end

      def index = render json: Metrics::Recommendations.call(agency: Current.agency, range: range)

      private

      def range = params[:range].presence || "30d"
    end
  end
end

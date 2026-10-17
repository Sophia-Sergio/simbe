module Api
  module V1
    # Owner-only (docs/conventions: metrics expose spend). Each action calls one Metrics
    # service with the signed-in agency; the payload is already the contract shape.
    class MetricsController < Api::BaseController
      before_action :require_owner!

      rescue_from Metrics::BadRange do
        render_error("bad_range", "range must be one of 30d, 90d or 12m", :unprocessable_entity)
      end

      def summary = render json: Metrics::Summary.call(agency: Current.agency, range: range)

      def funnel = render json: Metrics::Funnel.call(agency: Current.agency, range: range)

      def channels = render json: Metrics::Channels.call(agency: Current.agency, range: range)

      def channel
        render json: Metrics::ChannelDetail.call(agency: Current.agency, range: range, channel: params[:channel])
      end

      private

      def range = params[:range].presence || "30d"
    end
  end
end

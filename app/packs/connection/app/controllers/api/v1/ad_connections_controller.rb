module Api
  module V1
    # Ad connections (owner only, spec decision 4): list, idempotent connect, idempotent
    # disconnect. Connecting generates sample spend so the Data sources screen has numbers.
    class AdConnectionsController < Api::BaseController
      before_action :require_owner!

      def index
        render json: {
          connections: Current.agency.ad_connections.order(:connected_at).map { |connection| connection_json(connection) }
        }
      end

      def create
        connection, created = AdConnections::Connect.call(
          agency: Current.agency,
          platform: params[:platform].to_s
        )
        render json: connection_json(connection), status: created ? :created : :ok
      rescue AdConnections::Connect::InvalidPlatform
        render_error("invalid_platform", "Platform must be meta or google", :unprocessable_entity)
      end

      # Idempotent and within the declared contract (204/403): an unknown platform is simply
      # nothing to disconnect. The 422 invalid_platform response was undocumented.
      def destroy
        Current.agency.ad_connections.find_by(platform: params[:platform].to_s)&.destroy
        head :no_content
      end

      private

      def connection_json(connection)
        {
          platform: connection.platform,
          status: connection.status,
          connected_at: connection.connected_at&.iso8601(3)
        }
      end
    end
  end
end

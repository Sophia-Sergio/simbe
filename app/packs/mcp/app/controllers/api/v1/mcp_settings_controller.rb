module Api
  module V1
    # Connect Claude settings (spec 2013 decision 9; contract getMcpSettings / rotateMcpKey).
    # Owner only. The server URL is `<MCP_PUBLIC_URL>/<agency slug>`; the API key is shown as its
    # bare prefix here and in full exactly once, by `rotate`, which revokes the previous key.
    class McpSettingsController < Api::BaseController
      before_action :require_owner!

      def show
        key = active_key
        payload = { url: server_url, key_prefix: key&.prefix }
        payload[:created_at] = key.created_at.iso8601 if key
        render json: payload
      end

      def rotate
        raw = Mcp::Keys.rotate!(agency: Current.agency, user: Current.user)
        render json: { key: raw, url: server_url, key_prefix: raw[0, Mcp::Keys::PREFIX_LENGTH] }, status: :created
        # The body carries the full key: never let a proxy or browser cache it.
        response.set_header("Cache-Control", "no-store")
      end

      private

      def active_key
        Current.agency.mcp_keys.active.order(created_at: :desc).first
      end

      def server_url
        "#{ENV.fetch("MCP_PUBLIC_URL", "http://localhost:3000/mcp").chomp("/")}/#{Current.agency.slug}"
      end
    end
  end
end

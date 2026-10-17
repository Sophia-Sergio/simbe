# Connect Claude settings (owner). Loaded by config/routes.rb inside
# `namespace :api do namespace :v1`, so these are /api/v1/mcp and /api/v1/mcp/rotate.
# The JSON-RPC endpoint itself is POST /mcp/:slug, outside /api/v1 (routes_root/mcp.rb).
get "mcp", to: "mcp_settings#show"
post "mcp/rotate", to: "mcp_settings#rotate"

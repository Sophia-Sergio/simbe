# The MCP JSON-RPC endpoint, outside /api/v1 (spec 2013, decision 7). Loaded by config/routes.rb
# before config/routes_root/zz_spa.rb, so it wins over the SPA catch-all. Auth is a Bearer key,
# not a session cookie; a GET on the endpoint is a 405 rather than the SPA shell.
post "mcp/:slug", to: "mcp#handle"
get "mcp/:slug", to: "mcp#method_not_allowed"

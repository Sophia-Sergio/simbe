# MCP settings (docs/conventions/multi-tenancy.md). Both derive from the signed-in agency and
# take no other agency's id, so they are :self routes. The JSON-RPC endpoint lives outside
# /api/v1 and is proven in spec/requests/mcp_spec.rb (wrong key 401, slug/key mismatch 404).
Isolation.register(method: :get, path: "/api/v1/mcp", scope: :self)
Isolation.register(method: :post, path: "/api/v1/mcp/rotate", scope: :self)

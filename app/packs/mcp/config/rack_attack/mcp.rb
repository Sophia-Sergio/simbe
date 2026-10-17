# 60 MCP requests per minute per key (spec 2013, decision 7). Loaded by
# config/initializers/rack_attack.rb through `Rack::Attack.instance_eval`.
#
# Rack::Attack runs before the Rails stack, so the raw Bearer token must never reach the cache:
# the throttle is keyed on a SHA-256 digest of the token (keys are secrets, like passwords). An
# unauthenticated request falls back to the IP (the endpoint then rejects it with 401 anyway).
throttle("mcp/requests", limit: 60, period: 1.minute) do |req|
  next unless req.post? && req.path.start_with?("/mcp/")

  token = req.get_header("HTTP_AUTHORIZATION").to_s[/\ABearer\s+(.+)\z/i, 1]
  token ? Digest::SHA256.hexdigest(token) : req.ip
end

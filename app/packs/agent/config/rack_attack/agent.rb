# 20 agent messages per minute per user (spec 2013, decision 5). Loaded by
# config/initializers/rack_attack.rb through `Rack::Attack.instance_eval`.
#
# Rack::Attack runs before the Rails stack, so it cannot read Current.user. The signed
# session cookie is stable for a signed-in session (one per user), so keying on it is
# per-user without decrypting the cookie here; fall back to the IP for an unauthenticated
# request (which the API then rejects with 401 anyway).
throttle("agent/messages", limit: 20, period: 1.minute) do |req|
  next unless req.post? && req.path == "/api/v1/agent/messages"

  req.cookies["simbe_session"].presence || req.ip
end

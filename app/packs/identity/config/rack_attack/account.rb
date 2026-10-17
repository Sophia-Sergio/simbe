# Signup and sign-in throttles (spec decision 1): 10 requests per minute per IP.
# Loaded by config/initializers/rack_attack.rb through `Rack::Attack.instance_eval`.
throttle("signup/ip", limit: 10, period: 1.minute) do |req|
  req.ip if req.post? && req.path == "/api/v1/signup"
end

throttle("session/ip", limit: 10, period: 1.minute) do |req|
  req.ip if req.post? && req.path == "/api/v1/session"
end

# Rack::Attack throttles live in the pack that owns the endpoint
# (`app/packs/<pack>/config/rack_attack/<name>.rb`) so a lane never edits this initializer
# (docs/superpowers/parallel/README.md, backend lane rule 1).
#
# Disabled in test: most specs would otherwise share one counter per IP and start failing
# once a file posts more than ten times. A spec that exercises throttling enables it itself.
Rack::Attack.enabled = false if Rails.env.test?

Dir[Rails.root.join("app/packs/*/config/rack_attack/*.rb")].sort.each do |file|
  Rack::Attack.instance_eval(File.read(file), file)
end

# Public invitation links carry a single-use token in the path
# (`/invitations/:token/preview|accept`). Scrub it from both request-log paths: the Rails
# "Started GET …" line (default/test/development) and lograge's structured `path` (production).
# This lane owns only this initializer, so the request-log hardening lives beside the throttles.
# Initializers cannot autoload pack constants, so load the two boot-time classes explicitly.
# Runtime code (controllers, jobs) still autoloads normally through Zeitwerk.
require Rails.root.join("app/packs/identity/app/services/signup/token_path_scrubber").to_s
require Rails.root.join("app/packs/identity/app/services/signup/scrubbing_request_logger").to_s

Rails.application.config.middleware.swap(Rails::Rack::Logger, Signup::ScrubbingRequestLogger)

if defined?(Lograge)
  redact_invitation_path = lambda do |data, _payload|
    data[:path] = Signup::TokenPathScrubber.redact(data[:path]) if data[:path]
    data
  end
  Rails.application.config.lograge.before_format = redact_invitation_path
  Lograge.before_format = redact_invitation_path
end

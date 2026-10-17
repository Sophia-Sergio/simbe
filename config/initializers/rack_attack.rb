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

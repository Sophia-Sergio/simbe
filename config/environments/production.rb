require "active_support/core_ext/integer/time"

Rails.application.configure do
  # Settings specified here will take precedence over those in config/application.rb.

  # Code is not reloaded between requests.
  config.enable_reloading = false

  # Eager load code on boot for better performance and memory savings (ignored by Rake tasks).
  config.eager_load = true

  # Full error reports are disabled.
  config.consider_all_requests_local = false

  # Turn on fragment caching in view templates.
  config.action_controller.perform_caching = true

  # Serve the Vite build (public/vite) and the rest of public/ from Rails/Thruster.
  # Fly sets RAILS_SERVE_STATIC_FILES=true (it is also baked into the image env).
  config.public_file_server.enabled = ENV["RAILS_SERVE_STATIC_FILES"].present?

  # Cache assets for far-future expiry since they are all digest stamped.
  # Vite hashes the filenames under public/vite/assets, so they can be cached immutably.
  config.public_file_server.headers = { "cache-control" => "public, max-age=#{1.year.to_i}, immutable" }

  # Enable serving of images, stylesheets, and JavaScripts from an asset server.
  # config.asset_host = "http://assets.example.com"

  # Assume all access to the app is happening through a SSL-terminating reverse proxy.
  config.assume_ssl = true

  # Force all access to the app over SSL, use Strict-Transport-Security, and use secure cookies.
  config.force_ssl = true

  # Skip http-to-https redirect for the default health check endpoint.
  # config.ssl_options = { redirect: { exclude: ->(request) { request.path == "/up" } } }

  # Log to STDOUT with the current request id as a default log tag.
  config.log_tags = [ :request_id ]
  config.logger   = ActiveSupport::TaggedLogging.logger(STDOUT)

  # Change to "debug" to log everything (including potentially personally-identifiable information!).
  config.log_level = ENV.fetch("RAILS_LOG_LEVEL", "info")

  # Prevent health checks from clogging up the logs.
  config.silence_healthcheck_path = "/up"

  # One structured (JSON) line per request. Lograge omits raw params by default; only the
  # request id and time are added. Sensitive keys stay filtered (see filter_parameters below).
  config.lograge.enabled = true
  config.lograge.formatter = Lograge::Formatters::Json.new
  config.lograge.custom_options = lambda do |event|
    { request_id: event.payload[:request_id], time: event.time }
  end

  # Don't log any deprecations.
  config.active_support.report_deprecations = false

  # Replace the default in-process memory cache store with a durable alternative.
  # config.cache_store = :mem_cache_store

  # Replace the default in-process and non-durable queuing backend for Active Job.
  # Solid Queue uses the primary database (no separate queue DB).
  config.active_job.queue_adapter = :solid_queue

  # Ignore bad email addresses and do not raise email delivery errors.
  # Set this to true and configure the email server for immediate delivery to raise delivery errors.
  # config.action_mailer.raise_delivery_errors = false

  # Set host to be used by links generated in mailer templates.
  config.action_mailer.default_url_options = { host: URI(ENV.fetch("APP_URL", "https://simbe.fly.dev")).host }

  # Specify outgoing SMTP server. Remember to add smtp/* credentials via bin/rails credentials:edit.
  # config.action_mailer.smtp_settings = {
  #   user_name: Rails.application.credentials.dig(:smtp, :user_name),
  #   password: Rails.application.credentials.dig(:smtp, :password),
  #   address: "smtp.example.com",
  #   port: 587,
  #   authentication: :plain
  # }

  # Enable locale fallbacks for I18n (makes lookups for any locale fall back to
  # the I18n.default_locale when a translation cannot be found).
  config.i18n.fallbacks = true

  # Do not dump schema after migrations.
  config.active_record.dump_schema_after_migration = false

  # Only use :id for inspections in production.
  config.active_record.attributes_for_inspect = [ :id ]

  # docs/conventions/sensitive-data.md: credentials and lead health data never reach the logs.
  # (Also set globally by config/initializers/filter_parameter_logging.rb; reinforced here so the
  # production environment is safe even if that initializer changes.)
  config.filter_parameters += %i[password token answer email phone key]

  # Production boot checks. `assets:precompile` (image build) runs with SECRET_KEY_BASE_DUMMY and no real
  # configuration, so the checks are skipped there; every real boot must have them.
  unless ENV["SECRET_KEY_BASE_DUMMY"]
    # Host-header injection / DNS rebinding guard: only our own host is served. Fly's health check
    # hits the machine directly, so /up is exempt.
    config.hosts = [ URI(ENV.fetch("APP_URL")).host ]
    config.host_authorization = { exclude: ->(request) { request.path == "/up" } }

    # Screener answers are health data (docs/conventions/sensitive-data.md): a deploy with a missing
    # key must fail at boot, not at the first encrypted write in the middle of an import.
    %w[AR_ENCRYPTION_PRIMARY_KEY AR_ENCRYPTION_KEY_DERIVATION_SALT].each { |name| ENV.fetch(name) }
  end
end

source "https://rubygems.org"

# Bundle edge Rails instead: gem "rails", github: "rails/rails", branch: "main"
gem "rails", "~> 8.1.4"
# Use postgresql as the database for Active Record
gem "pg", "~> 1.1"
# Use the Puma web server [https://github.com/puma/puma]
gem "puma", ">= 5.0"
# Use Redis adapter to run Action Cable in production
# gem "redis", ">= 4.0.1"

# Use Active Model has_secure_password [https://guides.rubyonrails.org/active_model_basics.html#securepassword]
gem "bcrypt", "~> 3.1.7"

# Serve the embedded React app (app/javascript) from Rails [https://vite-ruby.netlify.app/]
gem "vite_rails"
# Background jobs in the primary database, run inside Puma [https://github.com/rails/solid_queue]
gem "solid_queue"
# Throttling and request blocking [https://github.com/rack/rack-attack]
gem "rack-attack"
# Anthropic Claude SDK for the agent [https://github.com/anthropics/anthropic-sdk-ruby]
gem "anthropic"
# Structured request logs [https://github.com/roidrage/lograge]
gem "lograge"

# Windows does not include zoneinfo files, so bundle the tzinfo-data gem
gem "tzinfo-data", platforms: %i[ windows jruby ]

# Reduces boot times through caching; required in config/boot.rb
gem "bootsnap", require: false

# Add HTTP asset caching/compression and X-Sendfile acceleration to Puma [https://github.com/basecamp/thruster/]
gem "thruster", require: false

group :development, :test do
  # See https://guides.rubyonrails.org/debugging_rails_applications.html#debugging-with-the-debug-gem
  gem "debug", platforms: %i[ mri windows ], require: "debug/prelude"

  # Audits gems for known security defects (use config/bundler-audit.yml to ignore issues)
  gem "bundler-audit", require: false

  # Static analysis for security vulnerabilities [https://brakemanscanner.org/]
  gem "brakeman", require: false

  # Omakase Ruby styling [https://github.com/rails/rubocop-rails-omakase/]
  gem "rubocop-rails-omakase", require: false

  # RSpec [https://rspec.info/]
  gem "rspec-rails"
  # Test data factories [https://github.com/thoughtbot/factory_bot_rails]
  gem "factory_bot_rails"
  # Split the suite across CPUs [https://github.com/grosser/parallel_tests]
  gem "parallel_tests", require: false
end

group :test do
  # Stub HTTP requests (Anthropic) in specs [https://github.com/bblimke/webmock]
  gem "webmock"
  # Query-count assertions [https://github.com/civiccc/db-query-matchers]
  gem "db-query-matchers"
end

group :development do
  # Use console on exceptions pages [https://github.com/rails/web-console]
  gem "web-console"
end

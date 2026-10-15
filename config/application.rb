require_relative "boot"

require "rails"
# Pick the frameworks you want:
require "active_model/railtie"
require "active_job/railtie"
require "active_record/railtie"
# require "active_storage/engine"
require "action_controller/railtie"
require "action_mailer/railtie"
# require "action_mailbox/engine"
# require "action_text/engine"
require "action_view/railtie"
require "action_cable/engine"
# require "rails/test_unit/railtie"

# Require the gems listed in Gemfile, including any gems
# you've limited to :test, :development, or :production.
Bundler.require(*Rails.groups)

module App
  class Application < Rails::Application
    # Initialize configuration defaults for originally generated Rails version.
    config.load_defaults 8.1

    # Please, add to the `ignore` list any other `lib` subdirectories that do
    # not contain `.rb` files, or that should not be reloaded or eager loaded.
    # Common ones are `templates`, `generators`, or `middleware`, for example.
    config.autoload_lib(ignore: %w[assets tasks])

    # All timestamps are stored in UTC; agency time zones are display-time only.
    config.time_zone = "UTC"

    # Packs are autoloaded *and* eager-loaded (production eager loads; a path only on autoload_paths would resolve lazily there).
    %w[models controllers jobs services serializers mailers].each do |type|
      paths = Dir["#{root}/app/packs/*/app/#{type}"]
      config.autoload_paths.concat(paths)
      config.eager_load_paths.concat(paths)
    end
    concerns = Dir["#{root}/app/packs/*/app/services/concerns"]
    config.autoload_paths.concat(concerns); config.eager_load_paths.concat(concerns)

    # Configuration for the application, engines, and railties goes here.
    #
    # These settings can be overridden in specific environments using the files
    # in config/environments, which are processed later.
    #
    # config.eager_load_paths << Rails.root.join("extras")

    # Don't generate system test files; UUID primary keys on Simbe-owned tables.
    config.generators.system_tests = nil
    config.generators { |g| g.orm :active_record, primary_key_type: :uuid }
  end
end

# Owner-only coordinator performance. `:name` is a URL-encoded path segment that may contain
# dots ("J. Smith") and spaces; without the constraint Rails would split a trailing dot off as a
# format and 404. Loaded by config/routes.rb inside `namespace :api do namespace :v1`; ignored by
# Zeitwerk (config/application.rb), so this plain DSL is never eager-loaded at top level.
get "coordinators", to: "coordinators#index"
get "coordinators/:name", to: "coordinators#show", constraints: { name: %r{[^/]+} }, format: false

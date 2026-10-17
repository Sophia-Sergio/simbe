# Metrics + recommendations routes. Loaded by config/routes.rb inside
# `namespace :api do namespace :v1`. Owner-only is enforced by the controllers
# (require_owner!), not here. `app/packs/*/config` is ignored by Zeitwerk, so the
# plain DSL is never eager-loaded at top level.
get "metrics/summary", to: "metrics#summary"
get "metrics/funnel", to: "metrics#funnel"
get "metrics/channels", to: "metrics#channels"
get "metrics/channels/:channel", to: "metrics#channel"
get "recommendations", to: "recommendations#index"

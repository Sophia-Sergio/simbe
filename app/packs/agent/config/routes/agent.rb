# Ask Simbe agent routes. Loaded by config/routes.rb inside `namespace :api do namespace :v1`.
# `app/packs/*/config` is ignored by Zeitwerk, so this plain DSL is never eager-loaded.
post "agent/messages", to: "agent#create"
get "agent/conversations/:id", to: "agent#show"
get "agent/suggestions", to: "agent#suggestions"
get "agent/usage", to: "agent#usage"

# Next actions and the done/undo toggles. Loaded by config/routes.rb inside
# `namespace :api do namespace :v1`. `app/packs/*/config` is ignored by Zeitwerk (config/application.rb),
# so this plain DSL is never eager-loaded at top level.
get "next_actions", to: "next_actions#index"
post "next_actions/:lead_id/:queue/completion", to: "completions#create"
delete "next_actions/:lead_id/:queue/completion", to: "completions#destroy"

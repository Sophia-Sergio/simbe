# Leads routes. Loaded by config/routes.rb inside `namespace :api do namespace :v1 do`.
# `app/packs/*/config` is ignored by Zeitwerk, so this plain DSL is never eager-loaded.
# The board is declared before the :id route so "board" is never read as a lead id.
get "leads/board", to: "leads#board"
get "leads", to: "leads#index"
get "leads/:id", to: "leads#show"

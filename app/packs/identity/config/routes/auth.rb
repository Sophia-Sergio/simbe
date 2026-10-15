# Auth routes. Loaded by config/routes.rb inside `namespace :api do namespace :v1`.
# `app/packs/*/config` is ignored by Zeitwerk (config/application.rb), so the plain DSL here is
# never eager-loaded at top level.
resource :session, only: %i[create destroy]
resource :me, only: :show, controller: "me"

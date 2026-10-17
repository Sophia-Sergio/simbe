# Ad connection routes (loaded by config/routes.rb inside `namespace :api do namespace :v1`).
# Connecting and disconnecting are by platform, not by row id (spec decision 4).
resources :ad_connections, only: %i[index create]
delete "ad_connections/:platform", to: "ad_connections#destroy"

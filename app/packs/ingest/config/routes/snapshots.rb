# Snapshot upload/commit/current routes. Loaded by config/routes.rb inside
# `namespace :api do namespace :v1` (docs/conventions/parallel backend lane rules).
resources :snapshot_uploads, only: %i[create show destroy] do
  member { post :commit }
end

get "snapshots/current", to: "snapshots#current"

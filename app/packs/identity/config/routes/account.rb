# Account routes (loaded by config/routes.rb inside `namespace :api do namespace :v1`).
# Signup is public; every other account route requires an owner (spec decision 8).
post "signup", to: "signups#create"

# Agency settings (owner). Settings saves immediately via PATCH.
get "agency", to: "agencies#show"
patch "agency", to: "agencies#update"

# Team and invitations (owner), plus the two public invitation actions (decision 7).
get "team", to: "team#show"
resources :invitations, only: %i[create destroy]
get "invitations/:token/preview", to: "invitations#preview"
post "invitations/:token/accept", to: "invitations#accept"
get "coordinator_names", to: "coordinator_names#index"

# Account routes (loaded by config/routes.rb inside `namespace :api do namespace :v1`).
# Signup is public; every other account route requires an owner (spec decision 8).
post "signup", to: "signups#create"

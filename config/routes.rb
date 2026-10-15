Rails.application.routes.draw do
  get "up" => "rails/health#show", as: :rails_health_check

  # Extension points: a lane adds a route by adding a file in its own pack, never by editing this one.
  # Order matters: pack API routes, pack root routes, then core root routes (zz_spa.rb, the SPA catch-all, last).
  namespace :api do
    namespace :v1 do
      Dir[Rails.root.join("app/packs/*/config/routes/*.rb")].sort.each { |file| instance_eval(File.read(file), file) }
    end
  end
  Dir[Rails.root.join("app/packs/*/config/routes_root/*.rb")].sort.each { |file| instance_eval(File.read(file), file) }
  Dir[Rails.root.join("config/routes_root/*.rb")].sort.each { |file| instance_eval(File.read(file), file) }
end

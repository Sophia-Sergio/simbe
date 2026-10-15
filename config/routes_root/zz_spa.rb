# Loaded last by config/routes.rb: the API catch-all, then the SPA catch-all, then the root.
match "/api/*path", via: :all, to: "api/not_found#show"
get "*path", to: "spa#index", constraints: ->(req) { !req.path.start_with?("/api", "/mcp", "/up", "/vite", "/assets", "/brand", "/rails") && File.extname(req.path).empty? }
root to: "spa#index"

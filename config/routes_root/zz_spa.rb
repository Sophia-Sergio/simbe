# Loaded last by config/routes.rb: the API catch-all, then the SPA catch-all, then the root.
match "/api(/*path)", via: :all, to: "api/not_found#show"

# Reserved prefixes match whole path segments ("/up" and "/up/x", never "/updates"); missing static files stay 404s, but a dot inside a
# client route ("/coordinators/Dana%20O.") is not a file extension.
get "*path", to: "spa#index", constraints: lambda { |req|
  !req.path.match?(%r{\A/(api|mcp|up|vite[^/]*|assets|brand|rails)(/|\z)}) &&
    !req.path.match?(/\.(js|mjs|css|map|png|jpe?g|gif|svg|ico|webp|avif|json|txt|xml|woff2?|ttf)\z/i)
}
root to: "spa#index"

# Auth routes. `config/routes.rb` instance_evals this file inside `namespace :api do namespace :v1`.
# `app/packs` is an `app/*` autoload root, so Zeitwerk eager load also requires this file at top
# level: the explicit module keeps it a valid constant there, and the guard stops the DSL from
# running outside the routes mapper (where `resource` does not exist).
module Identity
  module Config
    module Routes
      module Auth
      end
    end
  end
end

if respond_to?(:resource)
  resource :session, only: %i[create destroy]
  resource :me, only: :show, controller: "me"
end

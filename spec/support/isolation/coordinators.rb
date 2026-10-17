# Coordinator isolation (docs/conventions/multi-tenancy.md). The card list carries no id (:self);
# the detail addresses a coordinator name, which is agency-scoped data, so it must 404 when the
# name belongs to another agency (:tenant). AlphaScenario gives the other agency real coordinator
# names, so the request proves the check rather than an empty dataset.
Isolation.register(method: :get, path: "/api/v1/coordinators", scope: :self)
Isolation.register(
  method: :get, path: "/api/v1/coordinators/:name", scope: :tenant,
  resource: ->(agency) { AlphaScenario.load!(agency); "Dana Ortiz" },
  path_for: ->(name) { "/api/v1/coordinators/#{name.gsub(' ', '%20')}" }
)

# Metrics and recommendations derive every number from the signed-in agency and are
# owner-only; none takes another agency's resource id, so they register as :self (like
# /me). The data-isolation proof — another agency's loaded snapshot must not change the
# signed-in agency's totals — lives in spec/requests/metrics_spec.rb.
Isolation.register(method: :get, path: "/api/v1/metrics/summary", scope: :self)
Isolation.register(method: :get, path: "/api/v1/metrics/funnel", scope: :self)
Isolation.register(method: :get, path: "/api/v1/metrics/channels", scope: :self)
Isolation.register(method: :get, path: "/api/v1/metrics/channels/:channel", scope: :self)
Isolation.register(method: :get, path: "/api/v1/recommendations", scope: :self)

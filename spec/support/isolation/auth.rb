# Task 1 routes: /me returns only the signed-in user's own agency (:self); the
# session endpoints are unauthenticated/public.
Isolation.register(method: :post, path: "/api/v1/session", scope: :public)
Isolation.register(method: :delete, path: "/api/v1/session", scope: :self)
Isolation.register(method: :get, path: "/api/v1/me", scope: :self)

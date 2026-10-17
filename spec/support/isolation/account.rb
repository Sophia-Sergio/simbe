# Task 1 routes: signup is unauthenticated/public (it creates the agency and signs in);
# the mutation carries the CSRF header but no session.
Isolation.register(method: :post, path: "/api/v1/signup", scope: :public)

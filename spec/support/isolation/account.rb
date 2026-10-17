# B-ACCOUNT isolation registry (docs/conventions/multi-tenancy.md).
#
# Tenant routes that take another agency's resource are registered as :tenant with a factory
# and a path builder, so spec/isolation requests them with agency B's row and expects 404.
# Routes that only act on the signed-in agency (no id from the client) are :self; signup and
# the invitation preview/accept links are :public.

# Task 1: signup creates an agency and signs in (no session yet).
Isolation.register(method: :post, path: "/api/v1/signup", scope: :public)

# Agency settings (owner).
Isolation.register(method: :get, path: "/api/v1/agency", scope: :self)
Isolation.register(method: :patch, path: "/api/v1/agency", scope: :self)

# Team, invitations and the coordinator picker (owner).
Isolation.register(method: :get, path: "/api/v1/team", scope: :self)
Isolation.register(method: :post, path: "/api/v1/invitations", scope: :self)
Isolation.register(
  method: :delete,
  path: "/api/v1/invitations/:id",
  scope: :tenant,
  resource: lambda { |agency|
    Current.set(agency: agency) do
      Invitation.create!(
        agency: agency,
        email: "isolation-#{SecureRandom.hex(4)}@example.test",
        coordinator_name: "Beta Coordinator",
        token_digest: SecureRandom.hex(32),
        expires_at: 7.days.from_now
      )
    end
  },
  path_for: ->(invitation) { "/api/v1/invitations/#{invitation.id}" }
)
Isolation.register(method: :get, path: "/api/v1/invitations/:token/preview", scope: :public)
Isolation.register(method: :post, path: "/api/v1/invitations/:token/accept", scope: :public)
Isolation.register(method: :get, path: "/api/v1/coordinator_names", scope: :self)

# Ad connections (owner): platform is a name, not another agency's row id.
Isolation.register(method: :get, path: "/api/v1/ad_connections", scope: :self)
Isolation.register(method: :post, path: "/api/v1/ad_connections", scope: :self)
Isolation.register(method: :delete, path: "/api/v1/ad_connections/:platform", scope: :self)

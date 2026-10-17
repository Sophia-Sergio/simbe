# Ask Simbe isolation (docs/conventions/multi-tenancy.md). The message list, starter chips and
# usage derive from the signed-in agency/user, so they register as :self. A conversation
# addresses one id, so it must 404 across agencies (and, per spec decision 5, across users
# too — the request spec proves the same-agency case).
Isolation.register(method: :post, path: "/api/v1/agent/messages", scope: :self)
Isolation.register(method: :get, path: "/api/v1/agent/suggestions", scope: :self)
Isolation.register(method: :get, path: "/api/v1/agent/usage", scope: :self)

Isolation.register(
  method: :get, path: "/api/v1/agent/conversations/:id", scope: :tenant,
  resource: lambda { |agency|
    Current.agency = agency
    user = User.where(agency_id: agency.id).first ||
           User.create!(agency: agency, email: "iso-#{agency.id}@example.test", name: "Iso", role: "owner",
                        password: "secret-pass-1")
    AgentConversation.create!(agency: agency, user: user, title: "iso")
  },
  path_for: ->(conversation) { "/api/v1/agent/conversations/#{conversation.id}" }
)

# Lane B-LEADS routes for the isolation spec (docs/conventions/multi-tenancy.md).
# `/leads` and `/leads/board` carry no other agency's id, so they are `:self`; `/leads/:id`
# takes an id and is proven with another agency's lead (`:tenant`) — it must answer 404.
Isolation.register(method: :get, path: "/api/v1/leads/board", scope: :self)
Isolation.register(method: :get, path: "/api/v1/leads", scope: :self)

Isolation.register(
  method: :get, path: "/api/v1/leads/:id", scope: :tenant,
  resource: lambda do |agency|
    previous = Current.agency
    begin
      Current.agency = agency
      Lead.create!(external_id: SecureRandom.uuid, lead_created_at: Time.current, first_name: "Isolated",
                   last_name: "Lead", channel: "Unknown", current_stage: "inquiry", outcome: "open")
    ensure
      Current.agency = previous
    end
  end,
  path_for: ->(lead) { "/api/v1/leads/#{lead.external_id}" }
)

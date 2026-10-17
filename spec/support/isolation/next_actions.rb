# Next-actions isolation (docs/conventions/multi-tenancy.md). The queue list carries no id and is
# scoped to the signed-in agency (:self; the request spec proves it returns only that agency's
# items). A completion addresses one lead, so it must 404 across agencies (:tenant). The queue in
# the path is valid, so the bad_queue guard cannot answer before the scope check.
Isolation.register(method: :get, path: "/api/v1/next_actions", scope: :self)
[ :post, :delete ].each do |verb|
  Isolation.register(
    method: verb, path: "/api/v1/next_actions/:lead_id/:queue/completion", scope: :tenant,
    resource: ->(agency) { AlphaScenario.load!(agency); Lead.unscoped.find_by!(first_name: "L7") },
    path_for: ->(lead) { "/api/v1/next_actions/#{lead.external_id}/text_back_now/completion" }
  )
end

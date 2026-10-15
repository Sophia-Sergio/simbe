# Proves a tenant route never leaks another agency's resource (docs/conventions/multi-tenancy.md).
# Downstream lanes use it for every new tenant route:
#
#   include_examples "agency isolated", :get, ->(other) { "/api/v1/leads/#{other.id}" }
#
# The including spec must provide `actor` (a user of agency A) and `other` (a resource of another
# agency, usually created by the same factory). A correct app answers 404 — never 403 — for another
# agency's id.
RSpec.shared_examples "agency isolated" do |http_method, path_for, expected: :not_found|
  it "answers #{expected} for another agency's #{http_method.upcase} #{path_for.call('B')}" do
    post "/api/v1/session", params: { email: actor.email, password: "secret-pass-1" },
      headers: { "X-Requested-With" => "simbe" }, as: :json
    public_send(http_method, path_for.call(other_resource), headers: { "X-Requested-With" => "simbe" })
    expect(response).to have_http_status(expected)
  end
end

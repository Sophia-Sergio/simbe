# Proves a tenant route never leaks another agency's resource (docs/conventions/multi-tenancy.md).
# Downstream lanes use it for every new tenant route that takes an id:
#
#   let(:actor)          { create(:user, password: "secret-pass-1") }          # signs in as agency A
#   let(:own_resource)   { create(:lead, agency: actor.agency) }               # agency A's resource
#   let(:other_resource) { create(:lead, agency: create(:agency)) }            # another agency's
#   include_examples "agency isolated", :get, ->(resource) { "/api/v1/leads/#{resource.id}" }
#
# Two checks, so a route that simply 404s for everything cannot pass: A's own resource is served
# (2xx), and another agency's is 404 (never 403: a 403 would confirm that the id exists).
RSpec.shared_examples "agency isolated" do |http_method, path_for, expected: :not_found|
  let(:isolation_headers) { { "X-Requested-With" => "simbe" } }

  before do
    post "/api/v1/session", params: { email: actor.email, password: "secret-pass-1" }, headers: isolation_headers, as: :json
    expect(response).to have_http_status(:created)
  end

  it "serves the signed-in agency's own resource (#{http_method.to_s.upcase})" do
    public_send(http_method, path_for.call(own_resource), headers: isolation_headers)
    expect(response).to have_http_status(:success)
  end

  it "answers #{expected} for another agency's resource (#{http_method.to_s.upcase})" do
    public_send(http_method, path_for.call(other_resource), headers: isolation_headers)
    expect(response).to have_http_status(expected)
  end
end

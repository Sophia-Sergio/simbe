require "rails_helper"

# Owner spec for the two Connect Claude HTTP paths (docs/conventions/testing.md). Conformance is
# on, so this exercises getMcpSettings and rotateMcpKey against contracts/openapi/paths/mcp.yaml.
RSpec.describe "MCP settings API", type: :request do
  let(:headers) { { "X-Requested-With" => "simbe" } }
  let(:agency) { create(:agency, slug: "alpha", name: "Alpha", qualified_milestone: "consult_attended") }
  let!(:owner) { create(:user, agency: agency, role: "owner") }
  let!(:dana) { create(:user, :coordinator, agency: agency, coordinator_name: "Dana Ortiz") }

  around do |example|
    original = ENV["MCP_PUBLIC_URL"]
    ENV["MCP_PUBLIC_URL"] = "https://mcp.simbe.app"
    example.run
  ensure
    ENV["MCP_PUBLIC_URL"] = original
  end

  def sign_in(user)
    post "/api/v1/session", params: { email: user.email, password: "secret-pass-1" }, headers: headers, as: :json
    Current.agency = agency
  end

  it "returns the server url and no key before one is generated" do
    sign_in(owner)
    get "/api/v1/mcp"

    expect(response).to have_http_status(:ok)
    expect(response.parsed_body).to eq("url" => "https://mcp.simbe.app/alpha", "key_prefix" => nil)
  end

  it "returns the settings shape (url, prefix, created_at) once a key exists" do
    Mcp::Keys.rotate!(agency: agency, user: owner)
    sign_in(owner)
    get "/api/v1/mcp"

    expect(response.parsed_body.keys).to match_array(%w[url key_prefix created_at])
    expect(response.parsed_body["url"]).to eq("https://mcp.simbe.app/alpha")
    expect(response.parsed_body["key_prefix"]).to match(/\Asimbe_live_[A-Za-z0-9_-]{5}\z/)
    expect(response.parsed_body["created_at"]).to be_present
  end

  it "rotates the key: returns it once, stores only a digest and revokes the old key" do
    old = Mcp::Keys.rotate!(agency: agency, user: owner)
    sign_in(owner)
    post "/api/v1/mcp/rotate", headers: headers

    expect(response).to have_http_status(:created)
    body = response.parsed_body
    expect(body["key"]).to match(/\Asimbe_live_[A-Za-z0-9_-]{32}\z/)
    expect(body["key_prefix"]).to eq(body["key"][0, 16])
    expect(body["url"]).to eq("https://mcp.simbe.app/alpha")

    Current.agency = agency
    expect(McpKey.unscoped.pluck(:key_digest)).not_to include(body["key"])
    expect(Mcp::Keys.authenticate(old, slug: "alpha")).to be_nil
    expect(Mcp::Keys.authenticate(body["key"], slug: "alpha")).to be_present
  end

  it "hides the full key: only the prefix is ever returned by the settings read" do
    raw = Mcp::Keys.rotate!(agency: agency, user: owner)
    sign_in(owner)
    get "/api/v1/mcp"

    expect(response.body).to include(raw[0, 16])
    expect(response.body).not_to include(raw)
  end

  it "is owner-only" do
    sign_in(dana)
    get "/api/v1/mcp"
    expect(response).to have_http_status(:forbidden)

    post "/api/v1/mcp/rotate", headers: headers
    expect(response).to have_http_status(:forbidden)
  end

  it "requires a session" do
    get "/api/v1/mcp"
    expect(response).to have_http_status(:unauthorized)
  end
end

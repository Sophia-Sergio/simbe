require "rails_helper"

# The MCP JSON-RPC endpoint (spec 2013, decision 7). It lives outside /api/v1, so there is no
# OpenAPI conformance here: the JSON-RPC envelopes are asserted by hand (lane B-MCP override 4).
# Data is Alpha + AlphaSpend, loaded with AlphaScenario.load!.
RSpec.describe "MCP endpoint", type: :request do
  let(:agency) { create(:agency, slug: "alpha", name: "Alpha", qualified_milestone: "consult_attended") }
  let!(:owner) { create(:user, agency: agency, role: "owner") }

  before do
    Current.agency = agency
    @key = Mcp::Keys.rotate!(agency: agency, user: owner)
    AlphaScenario.load!(agency)
    AlphaSpend.load!(agency)
    Current.reset
  end

  def rpc(method, params = {}, id = 1, token: @key, slug: "alpha")
    post "/mcp/#{slug}",
         params: { jsonrpc: "2.0", id: id, method: method, params: params }.to_json,
         headers: { "Authorization" => "Bearer #{token}", "Content-Type" => "application/json" }
  end

  it "initializes with the Simbe server info and lists exactly the five tools" do
    rpc("initialize")
    expect(response).to have_http_status(:ok)
    expect(response.parsed_body["jsonrpc"]).to eq("2.0")
    expect(response.parsed_body.dig("result", "serverInfo", "name")).to eq("simbe")
    expect(response.parsed_body.dig("result", "protocolVersion")).to eq("2025-03-26")

    rpc("tools/list")
    names = response.parsed_body.dig("result", "tools").map { _1["name"] }
    expect(names).to eq(Agent::Tools::NAMES)
    expect(names.size).to eq(5)
  end

  it "calls a tool scoped to the key's agency" do
    rpc("tools/call", { name: "get_funnel", arguments: { range: "30d" } })

    expect(response).to have_http_status(:ok)
    result = response.parsed_body["result"]
    expect(result["isError"]).to be(false)
    data = JSON.parse(result.dig("content", 0, "text"))
    expect(data["stages"].map { _1["count"] }).to eq([ 10, 5, 4, 3, 2, 1 ])
  end

  it "returns isError (not a JSON-RPC error) for bad tool input" do
    rpc("tools/call", { name: "get_funnel", arguments: { range: "7d" } })

    result = response.parsed_body["result"]
    expect(result["isError"]).to be(true)
    expect(result.dig("content", 0, "text")).to match(/bad_input/)
  end

  it "answers notifications with 202" do
    rpc("notifications/initialized")

    expect(response).to have_http_status(:accepted)
    expect(response.body).to be_blank
  end

  it "returns -32601 for an unknown method" do
    rpc("tools/teleport")

    expect(response.parsed_body.dig("error", "code")).to eq(-32601)
    expect(response.parsed_body["id"]).to eq(1)
  end

  it "returns -32700 for malformed JSON" do
    post "/mcp/alpha", params: "{not json",
         headers: { "Authorization" => "Bearer #{@key}", "Content-Type" => "application/json" }

    expect(response.parsed_body.dig("error", "code")).to eq(-32700)
  end

  it "rejects a JSON-RPC batch with -32600" do
    post "/mcp/alpha", params: [ { jsonrpc: "2.0", id: 1, method: "ping" } ].to_json,
         headers: { "Authorization" => "Bearer #{@key}", "Content-Type" => "application/json" }

    expect(response.parsed_body.dig("error", "code")).to eq(-32600)
  end

  it "401s a wrong key and 404s a slug/key mismatch" do
    rpc("tools/list", token: "nope")
    expect(response).to have_http_status(:unauthorized)

    create(:agency, slug: "beta")
    rpc("tools/list", slug: "beta")
    expect(response).to have_http_status(:not_found)
  end

  it "revokes the old key on rotation and stores only a digest" do
    old = @key
    new_key = Mcp::Keys.rotate!(agency: agency, user: owner)

    rpc("tools/list", token: old)
    expect(response).to have_http_status(:unauthorized)

    rpc("tools/list", token: new_key)
    expect(response).to have_http_status(:ok)

    Current.agency = agency
    digests = McpKey.unscoped.pluck(:key_digest)
    expect(digests).not_to include(new_key, old)
    expect(digests).to include(Mcp::Keys.digest_for(new_key))
  end

  it "405s a GET on the endpoint" do
    get "/mcp/alpha", headers: { "Authorization" => "Bearer #{@key}" }
    expect(response).to have_http_status(:method_not_allowed)
  end

  # 60 requests/min/key (spec decision 7). Rack::Attack is disabled suite-wide; enable it with an
  # isolated counter store and exercise the real registered throttle through a bare Rack app, so
  # the contract observer is not involved (the endpoint is outside /api/v1 anyway).
  it "throttles a key to 60 requests per minute" do
    Rack::Attack.enabled = true
    Rack::Attack.cache.store = ActiveSupport::Cache::MemoryStore.new
    app = Rack::Builder.new do
      use Rack::Attack
      run ->(_env) { [ 200, {}, [ "ok" ] ] }
    end.to_app
    session = Rack::Test::Session.new(app)
    env = { "HTTP_AUTHORIZATION" => "Bearer #{@key}", "REMOTE_ADDR" => "127.0.0.1" }

    statuses = 61.times.map do
      session.post("/mcp/alpha", {}, env)
      session.last_response.status
    end
    expect(statuses.first(60)).to all(eq(200))
    expect(statuses.last).to eq(429)
  ensure
    Rack::Attack.enabled = false
  end

  # A fresh token per request would reset the per-key counter, so an IP-keyed throttle (300/min)
  # is the backstop. Same bare Rack app setup as above.
  it "throttles an IP to 300 requests per minute even with a fresh token each time" do
    Rack::Attack.enabled = true
    Rack::Attack.cache.store = ActiveSupport::Cache::MemoryStore.new
    app = Rack::Builder.new do
      use Rack::Attack
      run ->(_env) { [ 200, {}, [ "ok" ] ] }
    end.to_app
    session = Rack::Test::Session.new(app)

    statuses = 301.times.map do
      session.post("/mcp/alpha", {},
                   "HTTP_AUTHORIZATION" => "Bearer #{SecureRandom.hex(16)}", "REMOTE_ADDR" => "127.0.0.1")
      session.last_response.status
    end
    expect(statuses.first(300)).to all(eq(200))
    expect(statuses.last).to eq(429)
  ensure
    Rack::Attack.enabled = false
  end
end

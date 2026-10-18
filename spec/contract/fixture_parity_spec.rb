require "rails_helper"

# Cross-cutting fixture parity (W3-1 plan task 2 step 2): every contract operation that has an
# example under contracts/examples/** is called against the real Rails API on the Alpha scenario
# and compared with the fixture the MSW mocks serve, after normalizing ids and ISO timestamps
# (UUID -> <uuid>, ISO time -> <time>).
#
# The three operations the plan names as *documented* differences — the upload report contents,
# the MCP key and the agent answer — plus the Harbor-shaped `snapshots/current.json` (its row
# counts describe the real 3,530-lead export, not Alpha) assert **shape equality** only: the same
# keys and value types (arrays compared by element shape). Everything else must match exactly.
# Any failure here is recorded in docs/superpowers/parallel/integration-log.md with its resolution.
#
# One fixture per operation is compared; contracts/examples/snapshots/upload-{ok,errors,
# committing,committed}.json and current-loading.json are scenario variants of the same
# operations, exercised by spec/requests/snapshot_uploads_spec.rb.
RSpec.describe "Contract fixture parity", type: :request do
  UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
  TIME = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/

  let(:headers) { { "X-Requested-With" => "simbe" } }
  let(:agency) { create(:agency, slug: "harbor", name: "Harbor Surrogacy") }
  let!(:owner) { create(:user, agency: agency, email: "erin@harbor.test", name: "Erin Walsh") }
  let!(:dana) do
    create(:user, :coordinator, agency: agency, email: "dana@harbor.test", name: "Dana Ortiz",
                                coordinator_name: "Dana Ortiz")
  end
  let!(:invitation) do
    Current.set(agency: agency) do
      Invitation.create!(agency: agency, email: "maya@harbor.test", coordinator_name: "Jess Kim",
                         token_digest: SecureRandom.hex(32), expires_at: 30.days.from_now)
    end
  end

  before do
    Current.agency = agency
    AlphaScenario.load!(agency)
    AlphaSpend.load!(agency)
    Current.reset
  end

  around do |example|
    original = ENV["MCP_PUBLIC_URL"]
    ENV["MCP_PUBLIC_URL"] = "https://mcp.simbe.app"
    example.run
  ensure
    ENV["MCP_PUBLIC_URL"] = original
  end

  def sign_in(user)
    post "/api/v1/session", params: { email: user.email, password: "secret-pass-1" }, headers: headers, as: :json
    expect(response).to have_http_status(:created)
    Current.agency = user.agency
  end

  def fixture(path) = JSON.parse(Rails.root.join("contracts/examples", path).read)

  def lead(first_name) = Lead.find_by!(first_name: first_name)

  def upload_files
    Dir[File.join(AlphaScenario.copy_dir, "*.csv")].sort.map { |path| Rack::Test::UploadedFile.new(path, "text/csv") }
  end

  # --- normalization and shape helpers -------------------------------------------------------

  def normalize(value)
    case value
    when Hash then value.transform_values { |child| normalize(child) }
    when Array then value.map { |child| normalize(child) }
    when String then value.gsub(UUID, "<uuid>").gsub(TIME, "<time>")
    else value
    end
  end

  # Same keys and value types; arrays are compared by their element shape and an empty array is
  # Operations where an empty-vs-non-empty array difference against the fixture is expected, with the
  # reason. Anything else must fail, so a silently missing (or extra) array element can never pass.
  SHAPE_EMPTY_ARRAY_EXCEPTIONS = {
    "GET /snapshots/current" => "the example is the Harbor-sized export: it carries one normalized-source warning, Alpha carries none"
  }.freeze

  # Same keys and value types. Arrays are compared element by element against the fixture's element
  # shape (the fixture arrays are homogeneous), and an empty-vs-non-empty difference fails unless the
  # operation is listed in SHAPE_EMPTY_ARRAY_EXCEPTIONS.
  def assert_shape(actual, expected, path = "$", operation: nil)
    case expected
    when Hash
      expect(actual).to be_a(Hash), "#{path}: expected an object, got #{actual.class}"
      expect(actual.keys.sort).to eq(expected.keys.sort), "#{path}: keys differ (#{actual.keys.sort} vs #{expected.keys.sort})"
      expected.each { |key, value| assert_shape(actual[key], value, "#{path}.#{key}", operation: operation) }
    when Array
      expect(actual).to be_a(Array), "#{path}: expected an array, got #{actual.class}"
      if expected.empty? != actual.empty?
        expect(SHAPE_EMPTY_ARRAY_EXCEPTIONS).to(
          have_key(operation),
          "#{path}: fixture has #{expected.size} element(s), response has #{actual.size}: " \
          "add #{operation.inspect} to SHAPE_EMPTY_ARRAY_EXCEPTIONS with a reason"
        )
        return
      end
      return if expected.empty?

      expected.each { |element| assert_shape(element, expected.first, path, operation: operation) }
      actual.each { |element| assert_shape(element, expected.first, path, operation: operation) }
    when String then expect(actual).to be_a(String), "#{path}: expected a string, got #{actual.class}"
    when Integer, Float then expect(actual).to be_a(Numeric), "#{path}: expected a number, got #{actual.class}"
    when TrueClass, FalseClass then expect(actual).to be_in([ true, false ]), "#{path}: expected a boolean"
    when NilClass then expect(actual).to be_nil, "#{path}: expected null, got #{actual.inspect}"
    else expect(actual).to eq(expected)
    end
  end

  # --- canonicalization mirrored from the leads owner spec -----------------------------------

  def canonical_board(body)
    body["columns"].transform_values { |column| column.merge("leads" => column["leads"].sort_by { |card| card["id"] }) }
  end

  # --- lead-detail normalisation, limited to what integration-log.md documents ----------------
  #
  # Alpha carries no `web_sessions`, so the lead detail has no visit activity rows and its two
  # web-derived source fields are null/0; the contract example is the hand-authored one that does have
  # a visit. The example also hard-codes the pronoun "her" in `summary.next_step` where the app is
  # gender-neutral (resolution: CCR — the example should change, the app is right).
  # `assert_detail_fields` proves every normalised field is still present and shaped on the actual
  # response, so nothing is merely deleted.
  def prepare_detail(body)
    copy = Marshal.load(Marshal.dump(body))
    copy["activity"].reject! { |entry| entry["kind"] == "visit" }
    copy["source"]["first_visit"] = nil
    copy["source"]["pages_viewed"] = 0
    copy
  end

  def canonical_detail(body)
    copy = Marshal.load(Marshal.dump(body))
    copy["screener"]["items"] = copy["screener"]["items"].sort_by { |item| item["question"] }
    # Only the coordinator (the assigned one) sees raw answers; their text differs from the example,
    # so the value is compared by key presence and asserted as a present string below.
    copy["screener"]["items"].each { |item| item["answer"] = "<answer>" if item.key?("answer") }
    # The example hard-codes "her"; the app is gender-neutral (CCR: the example should change). Applied
    # to both sides so the rest of the sentence still has to match.
    copy["summary"]["next_step"] = copy["summary"]["next_step"].to_s.gsub(/\b(her|them)\b/, "<pronoun>")
    copy
  end

  # Proves the fields `prepare_detail`/`canonical_detail` touch are present and shaped on the real
  # response: no visit rows (Alpha has no web_sessions), the two source fields are the documented
  # values, `next_step` exists, and every screener item carries its question and verdict.
  def assert_detail_fields(actual)
    expect(actual["activity"]).to be_an(Array)
    expect(actual["activity"].map { |entry| entry["kind"] }).not_to include("visit")
    expect(actual["activity"]).to all(include("at", "kind", "title"))
    expect(actual.dig("source", "first_visit")).to be_nil
    expect(actual.dig("source", "pages_viewed")).to eq(0)
    expect(actual.dig("summary", "next_step")).to be_a(String).and be_present
    expect(actual.dig("screener", "items")).to all(include("question", "verdict"))
  end

  AGENT_RESPOND = {
    "text" => "Facebook is your cheapest channel at about $150 per qualified surrogate.",
    "chart" => { "title" => "Cost per qualified lead",
                 "bars" => [ { "label" => "Facebook", "value" => 150, "display" => "$150" } ] },
    "action" => { "label" => "Open channels", "route" => "/channels" },
    "sources" => [ { "label" => "Channels", "route" => "/channels" } ],
    "suggestions" => [ "What about Google?", "Where do applicants drop off?" ]
  }.freeze

  CASES = [
    { name: "GET /me (owner)", fixture: "auth/me-owner.json", as: :owner,
      call: -> { get "/api/v1/me" } },
    { name: "GET /me (coordinator)", fixture: "auth/me-coordinator.json", as: :coordinator,
      call: -> { get "/api/v1/me" } },
    { name: "GET /agency", fixture: "account/agency.json", as: :owner,
      call: -> { get "/api/v1/agency" } },
    { name: "GET /team", fixture: "account/team.json", as: :owner,
      call: -> { get "/api/v1/team" } },
    { name: "GET /metrics/summary", fixture: "metrics/summary.json", as: :owner,
      call: -> { get "/api/v1/metrics/summary", params: { range: "30d" } } },
    { name: "GET /metrics/funnel", fixture: "metrics/funnel.json", as: :owner,
      call: -> { get "/api/v1/metrics/funnel", params: { range: "30d" } } },
    { name: "GET /metrics/channels", fixture: "metrics/channels.json", as: :owner,
      call: -> { get "/api/v1/metrics/channels", params: { range: "30d" } } },
    { name: "GET /metrics/channels/{channel}", fixture: "metrics/channel-facebook.json", as: :owner,
      call: -> { get "/api/v1/metrics/channels/Facebook", params: { range: "30d" } } },
    { name: "GET /recommendations", fixture: "metrics/recommendations.json", as: :owner,
      call: -> { get "/api/v1/recommendations", params: { range: "30d" } } },
    { name: "GET /leads", fixture: "leads/list.json", as: :owner,
      call: -> { get "/api/v1/leads" } },
    { name: "GET /leads/board", fixture: "leads/board.json", as: :owner, transform: :canonical_board,
      call: -> { get "/api/v1/leads/board" } },
    { name: "GET /leads/{id} (owner)", fixture: "leads/detail-owner.json", as: :owner,
      prep: :prepare_detail, transform: :canonical_detail, assert: :assert_detail_fields,
      call: -> { get "/api/v1/leads/#{lead('L4').external_id}" } },
    { name: "GET /leads/{id} (coordinator)", fixture: "leads/detail-coordinator.json", as: :coordinator,
      prep: :prepare_detail, transform: :canonical_detail, assert: :assert_detail_fields,
      call: -> { get "/api/v1/leads/#{lead('L4').external_id}" } },
    { name: "GET /next_actions", fixture: "next-actions/next-actions.json", as: :owner,
      call: -> { get "/api/v1/next_actions" } },
    { name: "GET /coordinators", fixture: "coordinators/list.json", as: :owner,
      call: -> { get "/api/v1/coordinators" } },
    { name: "GET /coordinators/{name}", fixture: "coordinators/detail-dana.json", as: :owner,
      call: -> { get "/api/v1/coordinators/Dana%20Ortiz" } },
    { name: "GET /snapshots/current", fixture: "snapshots/current.json", as: :owner, shape: true,
      call: -> { get "/api/v1/snapshots/current" } },
    { name: "GET /mcp", fixture: "mcp/settings.json", as: :owner, shape: true,
      setup: -> { Mcp::Keys.rotate!(agency: agency, user: owner) },
      call: -> { get "/api/v1/mcp" } },
    { name: "POST /invitations", fixture: "account/invitation-created.json", as: :owner, shape: true, status: :created,
      call: -> { post "/api/v1/invitations", params: { email: "new@harbor.test", coordinator_name: "Jess Kim" }, headers: headers, as: :json } },
    { name: "POST /agent/messages", fixture: "agent/answer.json", as: :owner, shape: true, status: :created,
      setup: -> { stub_anthropic(anthropic_message(content: [ tool_use("respond", AGENT_RESPOND, id: "t") ], stop_reason: "tool_use")) },
      call: -> { post "/api/v1/agent/messages", params: { text: "Which channel is cheapest?" }, headers: headers, as: :json } },
    { name: "POST /snapshot_uploads", fixture: "snapshots/upload-created.json", as: :owner, shape: true, status: :created,
      call: -> { post "/api/v1/snapshot_uploads", params: { files: upload_files }, headers: headers } },
    { name: "GET /metrics/summary (agency with no data)", fixture: "metrics/summary-empty.json", as: :empty,
      call: -> { get "/api/v1/metrics/summary", params: { range: "30d" } } }
  ].freeze

  CASES.each do |contract_case|
    it "matches the #{contract_case[:name]} example" do
      user =
        case contract_case[:as]
        when :coordinator then dana
        when :empty then create(:user, agency: create(:agency, slug: "empty", name: "Empty"), email: "owner@empty.test")
        else owner
        end
      sign_in(user)
      instance_exec(&contract_case[:setup]) if contract_case[:setup]
      instance_exec(&contract_case[:call])

      expect(response).to have_http_status(contract_case[:status] || :ok)
      actual = response.parsed_body
      send(contract_case[:assert], actual) if contract_case[:assert]

      expected = fixture(contract_case[:fixture])
      expected = send(contract_case[:prep], expected) if contract_case[:prep]
      actual = send(contract_case[:transform], actual) if contract_case[:transform]
      expected = send(contract_case[:transform], expected) if contract_case[:transform]

      if contract_case[:shape]
        assert_shape(actual, expected, operation: contract_case[:name])
      else
        expect(normalize(actual)).to eq(normalize(expected))
      end
    end
  end
end

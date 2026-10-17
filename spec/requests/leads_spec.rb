require "rails_helper"

# The HTTP owner spec for the leads paths (docs/conventions/testing.md). Runs with OpenAPI
# conformance on (spec/support/contract.rb), so every response is validated against
# contracts/openapi/paths/leads.yaml, and the three documented examples are pinned: the board
# and list must equal contracts/examples/leads/{board,list}.json, and the owner/assigned
# coordinator detail must equal detail-{owner,coordinator}.json (see `expected_detail` for the
# two things AlphaScenario cannot carry).
RSpec.describe "Leads API", type: :request do
  let(:headers) { { "X-Requested-With" => "simbe" } }
  let(:agency) { create(:agency, slug: "alpha", qualified_milestone: "consult_attended") }
  let!(:owner) { create(:user, agency: agency) }
  let!(:dana) { create(:user, :coordinator, agency: agency, coordinator_name: "Dana Ortiz") }
  before { Current.agency = agency; AlphaScenario.load!(agency) }

  def sign_in(user)
    post "/api/v1/session", params: { email: user.email, password: "secret-pass-1" }, headers: headers, as: :json
    expect(response).to have_http_status(:created)
    Current.agency = agency
  end

  def fixture(name) = JSON.parse(Rails.root.join("contracts/examples/leads/#{name}.json").read)

  def lead(first_name) = Lead.find_by!(first_name: first_name)

  it "requires a session" do
    get "/api/v1/leads", headers: headers
    expect(response).to have_http_status(:unauthorized)
  end

  it "lists the open leads exactly as the contract example" do
    sign_in(owner)
    get "/api/v1/leads", headers: headers
    expect(response.parsed_body).to eq(fixture("list"))
  end

  it "returns the board exactly as the contract example (column order canonicalized)" do
    sign_in(owner)
    get "/api/v1/leads/board", headers: headers
    expect(response).to have_http_status(:ok)
    expect(canonical_board(response.parsed_body)).to eq(canonical_board(fixture("board")))
  end

  it "paginates the list with a keyset cursor" do
    sign_in(owner)
    get "/api/v1/leads", params: { per: 3 }, headers: headers
    first = response.parsed_body
    expect(first["leads"].map { |card| card["name"] }).to eq([ "L7 Alpha", "L8 Alpha", "L4 Alpha" ])
    expect(first["next_cursor"]).to be_present

    get "/api/v1/leads", params: { per: 3, cursor: first["next_cursor"] }, headers: headers
    expect(response.parsed_body["leads"].map { |card| card["name"] }).to eq([ "L3 Alpha", "L2 Alpha" ])
  end

  it "searches with literal wildcards" do
    sign_in(owner)
    get "/api/v1/leads", params: { q: "%" }, headers: headers
    expect(response.parsed_body["leads"]).to eq([])
  end

  it "gives a coordinator only their own leads" do
    sign_in(dana)
    get "/api/v1/leads", params: { status: "all" }, headers: headers
    expect(response.parsed_body["leads"].map { |card| card["name"] }).to match_array([ "L3 Alpha", "L4 Alpha", "L5 Alpha", "L10 Alpha" ])
  end

  it "ignores the coordinator filter for a coordinator and honors it for the owner" do
    sign_in(dana)
    get "/api/v1/leads", params: { status: "all", coordinator: "Priya Shah" }, headers: headers
    expect(response.parsed_body["leads"].map { |card| card["name"] }).to match_array([ "L3 Alpha", "L4 Alpha", "L5 Alpha", "L10 Alpha" ])

    sign_in(owner)
    get "/api/v1/leads", params: { status: "all", coordinator: "Priya Shah" }, headers: headers
    expect(response.parsed_body["leads"].map { |card| card["name"] }).to match_array([ "L6 Alpha", "L7 Alpha", "L8 Alpha" ])
  end

  it "scopes the board to a coordinator" do
    sign_in(dana)
    get "/api/v1/leads/board", headers: headers
    expect(response.parsed_body.dig("columns", "action_needed", "count")).to eq(3)
    expect(response.parsed_body["columns"].values.flat_map { |column| column["leads"] }.map { |card| card["name"] })
      .to match_array([ "L3 Alpha", "L4 Alpha", "L10 Alpha" ])
  end

  it "404s another coordinator's lead for a coordinator" do
    sign_in(dana)
    get "/api/v1/leads/#{lead('L1').external_id}", headers: headers
    expect(response).to have_http_status(:not_found)
  end

  it "404s an unknown lead id" do
    sign_in(owner)
    get "/api/v1/leads/#{SecureRandom.uuid}", headers: headers
    expect(response).to have_http_status(:not_found)
  end

  it "returns the owner detail matching the contract example" do
    sign_in(owner)
    get "/api/v1/leads/#{lead('L4').external_id}", headers: headers
    expect(response).to have_http_status(:ok)
    expect(canonical_detail(response.parsed_body)).to eq(canonical_detail(expected_detail("detail-owner")))
    expect(response.parsed_body.dig("contact", "can_contact")).to be(false)
  end

  it "returns the assigned coordinator detail matching the contract example" do
    sign_in(dana)
    get "/api/v1/leads/#{lead('L4').external_id}", headers: headers
    expect(canonical_detail(response.parsed_body)).to eq(canonical_detail(expected_detail("detail-coordinator", coordinator: true)))
    expect(response.parsed_body.dig("contact", "can_contact")).to be(true)
  end

  def canonical_board(body)
    body["columns"].transform_values { |column| column.merge("leads" => column["leads"].sort_by { |card| card["id"] }) }
  end

  # The 10 questions are all answered by every Alpha lead, so their frequency ties and the
  # order among equal-frequency questions is not defined by the data; compare them by question.
  def canonical_detail(body)
    copy = Marshal.load(Marshal.dump(body))
    copy["screener"]["items"] = copy["screener"]["items"].sort_by { |item| item["question"] }
    copy
  end

  # The Alpha scenario (W0-3) carries no web_sessions and answers every screener question
  # `yes`, so the two web-derived fields and the coordinator's answer text differ from the
  # hand-authored example; everything else must match byte for byte.
  def expected_detail(name, coordinator: false)
    expected = Marshal.load(Marshal.dump(fixture(name)))
    expected["activity"].reject! { |entry| entry["kind"] == "visit" }
    expected["source"]["first_visit"] = nil
    expected["source"]["pages_viewed"] = 0
    if coordinator
      expected["screener"]["items"].each do |item|
        item["answer"] = "yes" unless item["question"] == "How old are you?"
      end
    end
    expected
  end
end

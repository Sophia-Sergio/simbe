require "rails_helper"

# One owner spec per HTTP path (docs/conventions/testing.md). The Alpha responses must
# equal the contract examples after a JSON round-trip (lane override 6); only the summary's
# snapshot id is dynamic, so it is copied from the response before comparing.
RSpec.describe "Metrics API", type: :request do
  let(:headers) { { "X-Requested-With" => "simbe" } }
  let(:agency) { create(:agency, slug: "alpha", qualified_milestone: "consult_attended") }
  let!(:owner) { create(:user, agency: agency) }
  let!(:coordinator) { create(:user, :coordinator, agency: agency) }

  before do
    Current.agency = agency
    AlphaScenario.load!(agency)
    AlphaSpend.load!(agency)
    Current.reset
  end

  def sign_in(user)
    post "/api/v1/session", params: { email: user.email, password: "secret-pass-1" }, headers: headers, as: :json
  end

  def fixture(name)
    JSON.parse(Rails.root.join("contracts/examples/metrics/#{name}.json").read)
  end

  describe "as the owner" do
    before { sign_in(owner) }

    it "serves the summary exactly like contracts/examples/metrics/summary.json" do
      get "/api/v1/metrics/summary", params: { range: "30d" }
      expect(response).to have_http_status(:ok)
      body = response.parsed_body
      expected = fixture("summary")
      expected["snapshot"]["id"] = body.dig("snapshot", "id")
      expect(body).to eq(expected)
    end

    it "counts distinct people next to inquiries without changing the headline numbers" do
      Current.agency = agency
      Lead.find_by!(first_name: "L2").update_columns(person_id: Lead.find_by!(first_name: "L1").person_id)
      Current.reset

      get "/api/v1/metrics/summary", params: { range: "30d" }

      kpis = response.parsed_body["kpis"]
      expect(kpis["unique_people"]).to eq(9)
      expect(kpis.dig("leads", "value")).to eq(10)
      expect(kpis.dig("qualified", "value")).to eq(3)
    end

    it "serves the funnel exactly like contracts/examples/metrics/funnel.json" do
      get "/api/v1/metrics/funnel", params: { range: "30d" }
      expect(response).to have_http_status(:ok)
      expect(response.parsed_body).to eq(fixture("funnel"))
    end

    it "serves the channels table exactly like contracts/examples/metrics/channels.json" do
      get "/api/v1/metrics/channels", params: { range: "30d" }
      expect(response).to have_http_status(:ok)
      expect(response.parsed_body).to eq(fixture("channels"))
    end

    it "serves a channel detail exactly like contracts/examples/metrics/channel-facebook.json" do
      get "/api/v1/metrics/channels/Facebook", params: { range: "30d" }
      expect(response).to have_http_status(:ok)
      expect(response.parsed_body).to eq(fixture("channel-facebook"))
    end

    it "serves recommendations exactly like contracts/examples/metrics/recommendations.json" do
      get "/api/v1/recommendations", params: { range: "30d" }
      expect(response).to have_http_status(:ok)
      expect(response.parsed_body).to eq(fixture("recommendations"))
    end

    it "422s a bad range and 404s an unknown channel" do
      # The contract both enums `range` and documents a 422 bad_range response; the enum
      # check runs first, so this deliberate invalid request opts out of conformance.
      get "/api/v1/metrics/summary", params: { range: "7d" }, headers: { "X-Simbe-Contract-Probe" => "1" }
      expect(response).to have_http_status(:unprocessable_entity)
      expect(response.parsed_body.dig("error", "code")).to eq("bad_range")

      get "/api/v1/metrics/channels/Podcast"
      expect(response).to have_http_status(:not_found)
    end
  end

  it "forbids coordinators on every endpoint (owner-only)" do
    sign_in(coordinator)
    %w[
      /api/v1/metrics/summary /api/v1/metrics/funnel /api/v1/metrics/channels
      /api/v1/metrics/channels/Facebook /api/v1/recommendations
    ].each do |path|
      get path
      expect(response).to have_http_status(:forbidden), "#{path} was not forbidden"
    end
  end

  it "requires a session" do
    # contracts/openapi/paths/metrics.yaml documents 403/422 but not 401, so this one probe
    # of the undocumented auth response opts out of conformance (the spa_spec precedent).
    get "/api/v1/metrics/summary", headers: { "X-Simbe-Contract-Probe" => "1" }
    expect(response).to have_http_status(:unauthorized)
  end

  describe "agency isolation (no endpoint may count another agency's loaded snapshot)" do
    before do
      other = create(:agency, slug: "beta")
      Current.agency = other
      AlphaScenario.load!(other, :v2) # 12 leads, so a leak would show up as 22
      Current.reset
      sign_in(owner)
    end

    it "keeps the summary to agency A" do
      get "/api/v1/metrics/summary", params: { range: "30d" }
      expect(response.parsed_body.dig("kpis", "leads", "value")).to eq(10)
      expect(response.parsed_body.dig("kpis", "qualified", "value")).to eq(3)
    end

    it "keeps the funnel to agency A" do
      get "/api/v1/metrics/funnel", params: { range: "30d" }
      expect(response.parsed_body["total"]).to eq(10)
      expect(response.parsed_body["stages"].map { _1["count"] }).to eq([ 10, 5, 4, 3, 2, 1 ])
    end

    it "keeps the channels table to agency A" do
      get "/api/v1/metrics/channels", params: { range: "30d" }
      expect(response.parsed_body["rows"].sum { _1["leads"] }).to eq(10)
      expect(response.parsed_body.dig("insights", "unattributed", "count")).to eq(1)
    end

    it "keeps recommendations to agency A" do
      get "/api/v1/recommendations", params: { range: "30d" }
      expect(response.parsed_body.map { _1["id"] }).to eq(%w[funnel_leak no_shows])
      expect(response.parsed_body.first["impact"]).to eq("5 leads stalled")
    end
  end
end

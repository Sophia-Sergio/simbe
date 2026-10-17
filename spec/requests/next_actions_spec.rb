require "rails_helper"

# One owner spec per HTTP path (docs/conventions/testing.md): GET /next_actions and the
# POST/DELETE completion toggles. Conformance is on, so this also exercises the
# getNextActions / completeNextAction / undoNextAction contract operations.
RSpec.describe "Next actions API", type: :request do
  let(:headers) { { "X-Requested-With" => "simbe" } }
  let(:agency) { create(:agency, slug: "alpha", timezone: "America/Los_Angeles") }
  let!(:owner) { create(:user, agency: agency, password: "secret-pass-1") }
  let!(:dana) { create(:user, :coordinator, agency: agency, coordinator_name: "Dana Ortiz", password: "secret-pass-1") }

  before do
    Current.agency = agency
    AlphaScenario.load!(agency)
    Current.reset
  end

  def sign_in(user)
    post "/api/v1/session", params: { email: user.email, password: "secret-pass-1" }, headers: headers, as: :json
  end

  it "returns the NextActions contract example for the owner" do
    sign_in(owner)
    get "/api/v1/next_actions"
    expect(response).to have_http_status(:ok)

    example = JSON.parse(Rails.root.join("contracts/examples/next-actions/next-actions.json").read)
    expect(response.parsed_body).to eq(example)
  end

  it "gives a coordinator only their own items" do
    sign_in(dana)
    get "/api/v1/next_actions"

    names = response.parsed_body["queues"].flat_map { _1["items"] }.map { _1["name"] }
    expect(names).to match_array([ "L3 Alpha", "L4 Alpha", "L10 Alpha" ])
    expect(response.parsed_body["progress"]).to eq("done" => 0, "total" => 3)
  end

  it "lets the owner narrow to one coordinator (ignored for a coordinator)" do
    sign_in(owner)
    get "/api/v1/next_actions", params: { coordinator: "Priya Shah" }
    expect(response.parsed_body["queues"].flat_map { _1["items"] }.map { _1["name"] }).to eq([ "L7 Alpha" ])
  end

  it "toggles done through the API and reflects it in counts and progress" do
    sign_in(owner)
    lead = Lead.unscoped.find_by!(first_name: "L7")

    post "/api/v1/next_actions/#{lead.external_id}/text_back_now/completion", headers: headers
    expect(response).to have_http_status(:ok)
    expect(response.parsed_body).to eq("done" => true)

    get "/api/v1/next_actions"
    expect(response.parsed_body["progress"]).to eq("done" => 1, "total" => 4)
    expect(response.parsed_body["queues"].first["count"]).to eq(0)

    delete "/api/v1/next_actions/#{lead.external_id}/text_back_now/completion", headers: headers
    expect(response.parsed_body).to eq("done" => false)
    get "/api/v1/next_actions"
    expect(response.parsed_body["progress"]).to eq("done" => 0, "total" => 4)
  end

  it "404s a completion for another coordinator's lead" do
    sign_in(dana)
    lead = Lead.unscoped.find_by!(first_name: "L7") # Priya's

    post "/api/v1/next_actions/#{lead.external_id}/text_back_now/completion", headers: headers
    expect(response).to have_http_status(:not_found)
  end

  it "422s an unknown queue" do
    sign_in(owner)
    # The queue comes from the QueueKey enum on a real client; this deliberately probes a value
    # outside it, so it opts out of request conformance (HTTP_X_SIMBE_CONTRACT_PROBE) while still
    # asserting the documented 422 error envelope.
    post "/api/v1/next_actions/#{SecureRandom.uuid}/nope/completion",
         headers: headers.merge("X-Simbe-Contract-Probe" => "1")

    expect(response).to have_http_status(:unprocessable_entity)
    expect(response.parsed_body.dig("error", "code")).to eq("bad_queue")
  end

  it "requires a session" do
    get "/api/v1/next_actions"
    expect(response).to have_http_status(:unauthorized)
  end
end

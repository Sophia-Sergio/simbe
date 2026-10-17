require "rails_helper"

# Owner spec for the four Ask Simbe HTTP paths (docs/conventions/testing.md). Conformance is
# on, so this also exercises sendAgentMessage / getAgentConversation / getAgentSuggestions /
# getAgentUsage. Anthropic is stubbed; data is Alpha + AlphaSpend.
RSpec.describe "Agent API", type: :request do
  let(:headers) { { "X-Requested-With" => "simbe" } }
  let(:agency) { create(:agency, slug: "alpha", name: "Alpha", qualified_milestone: "consult_attended") }
  let!(:owner) { create(:user, agency: agency, role: "owner") }
  let!(:dana) { create(:user, :coordinator, agency: agency, coordinator_name: "Dana Ortiz") }

  before do
    Current.agency = agency
    AlphaScenario.load!(agency)
    AlphaSpend.load!(agency)
    Current.agency = agency
  end

  def sign_in(user)
    post "/api/v1/session", params: { email: user.email, password: "secret-pass-1" }, headers: headers, as: :json
    Current.agency = agency
  end

  it "answers a question and persists the thread" do
    stub_anthropic(anthropic_message(content: [ tool_use("respond", { "text" => "Dropped at Inquiry." }, id: "t") ], stop_reason: "tool_use"))
    sign_in(owner)
    post "/api/v1/agent/messages", params: { text: "Where do applicants drop off?" }, headers: headers, as: :json
    expect(response).to have_http_status(:created)
    cid = response.parsed_body["conversation_id"]
    expect(response.parsed_body.dig("message", "role")).to eq("assistant")

    get "/api/v1/agent/conversations/#{cid}"
    expect(response).to have_http_status(:ok)
    expect(response.parsed_body["messages"].map { _1["role"] }).to eq(%w[user assistant])
  end

  it "validates text" do
    sign_in(owner)
    post "/api/v1/agent/messages", params: { text: "" }, headers: headers.merge("X-Simbe-Contract-Probe" => "1"), as: :json
    expect(response.parsed_body.dig("error", "code")).to eq("empty_text")

    post "/api/v1/agent/messages", params: { text: "x" * 501 }, headers: headers.merge("X-Simbe-Contract-Probe" => "1"), as: :json
    expect(response.parsed_body.dig("error", "code")).to eq("text_too_long")
  end

  it "409s a second turn while one is running" do
    sign_in(owner)
    c = AgentConversation.create!(agency: agency, user: owner, turn_started_at: Time.current)
    post "/api/v1/agent/messages", params: { conversation_id: c.id, text: "again" }, headers: headers, as: :json
    expect(response).to have_http_status(:conflict)
    expect(response.parsed_body.dig("error", "code")).to eq("already_in_progress")
  end

  it "502s provider failure and frees the lock" do
    stub_request(:post, AnthropicStub::URL).to_return(status: 529, body: "{}")
    sign_in(owner)
    post "/api/v1/agent/messages", params: { text: "hi" }, headers: headers, as: :json
    expect(response).to have_http_status(:bad_gateway)
    expect(response.parsed_body.dig("error", "code")).to eq("model_unavailable")
    expect(AgentConversation.unscoped.where(user_id: owner.id).pick(:turn_started_at)).to be_nil
  end

  it "does not let a user read another user's conversation in the same agency" do
    other = create(:user, agency: agency, role: "owner")
    Current.agency = agency
    foreign = AgentConversation.create!(agency: agency, user: other, title: "theirs")

    sign_in(owner)
    get "/api/v1/agent/conversations/#{foreign.id}"
    expect(response).to have_http_status(:not_found)
  end

  it "does not let a user read another agency's conversation" do
    beta = create(:agency, slug: "beta")
    Current.agency = beta
    beta_user = create(:user, agency: beta, role: "owner")
    foreign = AgentConversation.create!(agency: beta, user: beta_user, title: "theirs")
    Current.agency = agency

    sign_in(owner)
    get "/api/v1/agent/conversations/#{foreign.id}"
    expect(response).to have_http_status(:not_found)
  end

  it "returns owner and coordinator suggestions" do
    sign_in(owner)
    get "/api/v1/agent/suggestions"
    expect(response.parsed_body["suggestions"].size).to eq(4)

    sign_in(dana)
    get "/api/v1/agent/suggestions"
    expect(response.parsed_body["suggestions"].size).to eq(3)
  end

  it "reports usage totals for the month to owners only" do
    Current.agency = agency
    AiUsageEvent.create!(agency: agency, user: owner, task: "agent", model: "claude-sonnet-5-5",
                         input_tokens: 100, output_tokens: 20, cost_cents: nil)

    sign_in(owner)
    get "/api/v1/agent/usage"
    expect(response).to have_http_status(:ok)
    expect(response.parsed_body).to include("input_tokens" => 100, "output_tokens" => 20, "cost_cents" => nil)
    expect(response.parsed_body["month"]).to eq(Time.current.strftime("%Y-%m"))

    sign_in(dana)
    get "/api/v1/agent/usage"
    expect(response).to have_http_status(:forbidden)
  end

  it "requires a session" do
    get "/api/v1/agent/suggestions"
    expect(response).to have_http_status(:unauthorized)
  end
end

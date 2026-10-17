require "rails_helper"

# Screener answers, emails and phones are health data and must never reach the AI provider
# (docs/conventions/sensitive-data.md, spec 2013 decision 4). This loads Alpha, sends a
# question while capturing every outbound Anthropic request body, and asserts none of them
# carries a lead's contact details, shared last name or a raw screener answer.
RSpec.describe "Agent privacy", type: :request do
  let(:headers) { { "X-Requested-With" => "simbe" } }
  # The agency name deliberately avoids "Alpha" so a hit on the leads' shared last name can
  # only come from leaked lead data, not from the prompt itself.
  let(:agency) { create(:agency, slug: "alpha", name: "Harbor Family", qualified_milestone: "consult_attended") }
  let!(:owner) { create(:user, agency: agency, role: "owner") }

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

  it "never sends a lead's email, phone, last name or raw screener answer to the model" do
    lead = Lead.find_by!(first_name: "L4")
    ScreenerAnswer.find_by!(lead: lead, question: "Do you smoke or use nicotine?").update!(answer: "SECRET-ANSWER-771")

    bodies = []
    replies = [
      anthropic_message(content: [ tool_use("get_next_actions", {}, id: "t1") ], stop_reason: "tool_use"),
      anthropic_message(content: [ tool_use("respond", { "text" => "Here is the summary." }, id: "t2") ], stop_reason: "tool_use")
    ]
    stub_request(:post, AnthropicStub::URL).to_return do |request|
      bodies << request.body.to_s
      { status: 200, headers: { "Content-Type" => "application/json" }, body: replies.shift.to_json }
    end

    sign_in(owner)
    post "/api/v1/agent/messages", params: { text: "What should I do first today?" }, headers: headers, as: :json
    expect(response).to have_http_status(:created)

    outbound = bodies.join("\n")
    expect(bodies).not_to be_empty
    expect(outbound).not_to include("l4.alpha@example.com")
    expect(outbound).not_to match(/555-0183-\d{4}/)
    expect(outbound).not_to include("Alpha")
    expect(outbound).not_to include("SECRET-ANSWER-771")
  end

  it "keeps the system prompt free of lead PII" do
    prompt = Agent::SystemPrompt.call(agency: agency, user: owner, as_of: Time.utc(2026, 10, 1))
    expect(prompt).not_to include("l4.alpha@example.com")
    expect(prompt).not_to match(/555-0183-\d{4}/)
    expect(prompt).not_to include("Alpha")
  end
end

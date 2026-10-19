require "rails_helper"

# Owner spec for the turn loop (docs/conventions/testing.md): tool dispatch, the sanitizer,
# the round cap, provider failures freeing the lock, the system prompt and the coordinator's
# single tool. Anthropic is stubbed; data is Alpha + AlphaSpend.
RSpec.describe Agent::TurnRunner do
  let(:agency) { create(:agency, slug: "alpha", name: "Alpha", qualified_milestone: "consult_attended") }
  let!(:owner) { create(:user, agency: agency, role: "owner") }
  let!(:dana) { create(:user, :coordinator, agency: agency, coordinator_name: "Dana Ortiz") }
  let(:convo) { AgentConversation.create!(agency: agency, user: owner, title: "q") }
  let(:dana_convo) { AgentConversation.create!(agency: agency, user: dana, title: "q") }

  before do
    Current.agency = agency
    AlphaScenario.load!(agency)
    AlphaSpend.load!(agency)
    Current.agency = agency
  end

  it "runs tools then finishes with respond and stores a structured message" do
    stub_anthropic(
      anthropic_message(content: [ tool_use("get_channel_performance", { "range" => "30d" }, id: "t1") ], stop_reason: "tool_use"),
      anthropic_message(content: [ tool_use("respond", {
        "text" => "Facebook is cheapest at $150 per qualified lead.",
        "chart" => { "title" => "Cost per qualified", "bars" => [ { "label" => "Facebook", "value" => 150, "display" => "$150" } ] },
        "action" => { "label" => "Open channels", "route" => "/channels" },
        "sources" => [ { "label" => "Channels", "route" => "/channels" } ],
        "suggestions" => [ "What about Google?" ] }, id: "t2") ], stop_reason: "tool_use")
    )
    msg = described_class.call(conversation: convo, text: "Which channel costs the most per qualified lead?")
    expect(msg.body["text"]).to match(/Facebook/)
    expect(msg.body["action"]).to eq("label" => "Open channels", "route" => "/channels")
    expect(AiUsageEvent.where(task: "agent").count).to eq(2)
    expect(AgentMessage.where(conversation_id: convo.id).order(:created_at).pluck(:role)).to eq(%w[user assistant])
  end

  it "stores no trailing tool_use without a result" do
    stub_anthropic(
      anthropic_message(content: [ tool_use("get_funnel", { "range" => "30d" }, id: "t1") ], stop_reason: "tool_use"),
      anthropic_message(content: [ tool_use("respond", { "text" => "ok" }, id: "t2") ], stop_reason: "tool_use")
    )
    described_class.call(conversation: convo, text: "hi")
    last = AgentMessage.where(conversation_id: convo.id).order(:created_at).last.api_content.last
    expect(last["role"]).to eq("assistant")
    expect(last["content"]).to all(include("type" => "text"))
  end

  it "drops routes that are not whitelisted" do
    stub_anthropic(anthropic_message(content: [ tool_use("respond", { "text" => "x", "action" => { "label" => "Hack", "route" => "https://evil.test" }, "sources" => [ { "label" => "s", "route" => "/admin" } ] }) ], stop_reason: "tool_use"))
    msg = described_class.call(conversation: convo, text: "hi")
    expect(msg.body).not_to include("action", "sources")
  end

  it "turns an unknown tool into an error tool_result and keeps going" do
    stub_anthropic(anthropic_message(content: [ tool_use("drop_tables", {}, id: "t1") ], stop_reason: "tool_use"),
                   anthropic_message(content: [ text_block("Sorry, I can't do that.") ]))
    expect(described_class.call(conversation: convo, text: "x").body["text"]).to match(/can't/)
    expect(WebMock).to have_requested(:post, AnthropicStub::URL).twice
  end

  it "stops after MAX_ROUNDS with a safe message" do
    stub_anthropic(*Array.new(7) { anthropic_message(content: [ tool_use("get_funnel", {}) ], stop_reason: "tool_use") })
    msg = described_class.call(conversation: convo, text: "loop")
    expect(msg.body["text"]).to match(/couldn't finish/i)
    expect(WebMock).to have_requested(:post, AnthropicStub::URL).times(6)
  end

  it "raises model_unavailable on provider errors and leaves no dangling tool_use" do
    stub_request(:post, AnthropicStub::URL).to_return(status: 529, body: { type: "error", error: { type: "overloaded_error", message: "x" } }.to_json)
    expect { described_class.call(conversation: convo, text: "hi") }.to raise_error(Agent::TurnRunner::Error, /model_unavailable/)
    expect(convo.reload.turn_started_at).to be_nil
    expect(AgentMessage.where(conversation_id: convo.id, role: "assistant").count).to eq(0)
  end

  it "puts the as_of date and role rules in the system prompt, never lead PII" do
    prompt = Agent::SystemPrompt.call(agency: agency, user: owner, as_of: Time.utc(2026, 10, 1))
    expect(prompt).to include("Alpha").and include("October 1, 2026").and include("Only use tool results")
    expect(prompt).to include("A lead is one inquiry").and include("unique_people")
    expect(prompt).not_to include("l1.alpha@example.com")
  end

  it "uses only get_next_actions for coordinators" do
    stub_anthropic(anthropic_message(content: [ text_block("ok") ]))
    described_class.call(conversation: dana_convo, text: "hi")
    expect(WebMock).to have_requested(:post, AnthropicStub::URL).with { |req| JSON.parse(req.body)["tools"].map { _1["name"] }.sort == %w[get_next_actions respond] }
  end

  it "turns any tool error into an error tool_result and keeps going" do
    allow(Agent::Tools).to receive(:call).and_raise(RuntimeError, "boom")
    stub_anthropic(anthropic_message(content: [ tool_use("get_funnel", {}, id: "t1") ], stop_reason: "tool_use"),
                   anthropic_message(content: [ text_block("Sorry.") ]))
    expect(described_class.call(conversation: convo, text: "x").body["text"]).to eq("Sorry.")
    expect(WebMock).to have_requested(:post, AnthropicStub::URL).twice
    expect(convo.reload.turn_started_at).to be_nil
  end

  it "stops at the turn deadline with a model_unavailable error" do
    stub_const("Agent::TurnRunner::DEADLINE", 0)
    stub_anthropic(anthropic_message(content: [ tool_use("respond", { "text" => "x" }, id: "t") ], stop_reason: "tool_use"))
    expect { described_class.call(conversation: convo, text: "x") }.to raise_error(Agent::TurnRunner::Error, /model_unavailable/)
    expect(WebMock).not_to have_requested(:post, AnthropicStub::URL)
    expect(convo.reload.turn_started_at).to be_nil
  end

  it "errors instead of returning empty text when the reply is truncated" do
    stub_anthropic(anthropic_message(content: [ tool_use("respond", { "text" => "" }, id: "t") ], stop_reason: "max_tokens"))
    expect { described_class.call(conversation: convo, text: "x") }.to raise_error(Agent::TurnRunner::Error, /model_unavailable/)
  end

  it "still answers when the ledger write fails" do
    allow(AiUsageEvent).to receive(:create!).and_raise(ActiveRecord::StatementInvalid, "db down")
    stub_anthropic(anthropic_message(content: [ tool_use("respond", { "text" => "fine" }, id: "t") ], stop_reason: "tool_use"))
    expect(described_class.call(conversation: convo, text: "x").body["text"]).to eq("fine")
  end
end

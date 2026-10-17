require "rails_helper"

# Owner spec for Ai::Client + Ai::Ledger (docs/conventions/testing.md): the HTTP call is
# stubbed, so this proves the wrapper's contract — block normalization, the required
# ledger, usage recorded even on tool_use, and the ENV model override.
RSpec.describe Ai::Client do
  let(:agency) { create(:agency) }
  let(:user) { create(:user, agency: agency) }
  before { Current.agency = agency }

  it "returns blocks and records usage on the ledger" do
    stub_anthropic(anthropic_message(content: [ text_block("hi") ], input: 120, output: 30))
    ledger = Ai::Ledger.new(agency: agency, user: user, task: "agent")
    reply = described_class.new(:agent).converse(messages: [ { role: "user", content: "hello" } ], system: "be brief", ledger: ledger)
    expect(reply[:content].first).to include("type" => "text", "text" => "hi")
    expect(reply[:stop_reason]).to eq("end_turn")
    event = AiUsageEvent.find(ledger.event_ids.first)
    expect(event).to have_attributes(task: "agent", model: "claude-sonnet-5-5", input_tokens: 120, output_tokens: 30)
  end

  it "requires a ledger" do
    expect { described_class.new(:agent).converse(messages: [], system: "x") }.to raise_error(ArgumentError, /ledger/)
  end

  it "records usage even when the response contains tool_use" do
    stub_anthropic(anthropic_message(content: [ tool_use("get_funnel", { range: "30d" }) ], stop_reason: "tool_use"))
    ledger = Ai::Ledger.new(agency: agency, user: user, task: "agent")
    reply = described_class.new(:agent).converse(messages: [ { role: "user", content: "q" } ], system: "s", tools: [ { name: "get_funnel", description: "d", input_schema: { type: "object", properties: {} } } ], ledger: ledger)
    expect(reply[:content].first["name"]).to eq("get_funnel")
    expect(ledger.event_ids.size).to eq(1)
  end

  it "leaves cost_cents nil while no price is confirmed for the model" do
    stub_anthropic(anthropic_message(content: [ text_block("hi") ], input: 1_000_000, output: 1_000_000))
    ledger = Ai::Ledger.new(agency: agency, user: user, task: "agent")
    described_class.new(:agent).converse(messages: [ { role: "user", content: "x" } ], system: "s", ledger: ledger)
    expect(AiUsageEvent.find(ledger.event_ids.first).cost_cents).to be_nil
  end

  it "uses the ENV override for the model" do
    stub_const("ENV", ENV.to_h.merge("AI_MODEL_AGENT" => "claude-haiku-5-5"))
    expect(described_class.new(:agent).model).to eq("claude-haiku-5-5")
  end
end

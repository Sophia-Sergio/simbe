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

  it "records a zero-token ledger row when the provider call fails" do
    stub_request(:post, AnthropicStub::URL).to_return(status: 529, body: "{}")
    ledger = Ai::Ledger.new(agency: agency, user: user, task: "agent")
    expect {
      described_class.new(:agent).converse(messages: [ { role: "user", content: "x" } ], system: "s", ledger: ledger)
    }.to raise_error(Anthropic::Errors::Error)

    event = AiUsageEvent.find(ledger.event_ids.first)
    expect(event).to have_attributes(task: "agent", model: "claude-sonnet-5-5",
                                     input_tokens: 0, output_tokens: 0, cost_cents: nil)
  end

  it "uses the ENV override for the model" do
    stub_const("ENV", ENV.to_h.merge("AI_MODEL_AGENT" => "claude-haiku-5-5"))
    expect(described_class.new(:agent).model).to eq("claude-haiku-5-5")
  end

  it "raises without an API key outside the test environment" do
    stub_const("ENV", ENV.to_h.except(*%w[ANTHROPIC_API_KEY E2E_STUB_ANTHROPIC]))
    allow(Rails).to receive(:env).and_return(ActiveSupport::EnvironmentInquirer.new("development"))
    expect { described_class.new(:agent) }.to raise_error(Ai::Client::ConfigurationError, /ANTHROPIC_API_KEY/)
  end

  it "falls back to a placeholder key in the test environment" do
    stub_const("ENV", ENV.to_h.except("ANTHROPIC_API_KEY"))
    expect(described_class.api_key).to eq("test")
  end

  it "replays the canned e2e answer (no provider call) and still records usage" do
    stub_const("ENV", ENV.to_h.merge("E2E_STUB_ANTHROPIC" => "1"))
    allow(Rails).to receive(:env).and_return(ActiveSupport::EnvironmentInquirer.new("development"))
    ledger = Ai::Ledger.new(agency: agency, user: user, task: "agent")
    reply = described_class.new(:agent).converse(messages: [ { role: "user", content: "q" } ], system: "s", ledger: ledger)
    expect(reply[:stop_reason]).to eq("tool_use")
    expect(reply[:content].first).to include("type" => "tool_use", "name" => "respond")
    expect(reply[:content].first.dig("input", "chart", "title")).to eq("Cost per qualified lead")
    expect(AiUsageEvent.find(ledger.event_ids.first)).to have_attributes(input_tokens: 812, output_tokens: 104)
  end

  it "never serves the canned answer outside development (test or production)" do
    stub_const("ENV", ENV.to_h.merge("E2E_STUB_ANTHROPIC" => "1"))
    allow(Rails).to receive(:env).and_return(ActiveSupport::EnvironmentInquirer.new("production"))
    expect(described_class.e2e_stubbed?).to be(false)
    allow(Rails).to receive(:env).and_return(ActiveSupport::EnvironmentInquirer.new("test"))
    expect(described_class.e2e_stubbed?).to be(false)
  end

  it "hands every caller a fresh copy of the canned answer" do
    described_class.e2e_response[:content].first["input"]["text"] = "mutated"
    expect(described_class.e2e_response[:content].first["input"]["text"]).not_to eq("mutated")
  end
end

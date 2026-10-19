require "rails_helper"

# Owner spec for the tool registry (docs/conventions/testing.md): role filtering, the four
# schemas, each tool's Alpha numbers, the input
# validator. Data comes from AlphaScenario (lane override 4), never the importer.
RSpec.describe Agent::Tools do
  let(:agency) { create(:agency, slug: "alpha", name: "Alpha", qualified_milestone: "consult_attended") }
  let!(:owner) { create(:user, agency: agency, role: "owner") }
  let!(:dana) { create(:user, :coordinator, agency: agency, coordinator_name: "Dana Ortiz") }

  before do
    Current.agency = agency
    AlphaScenario.load!(agency)
    Current.agency = agency
  end

  it "lists five tools for owners and one for coordinators" do
    expect(described_class.definitions(role: "owner").map { _1[:name] }).to eq(described_class::NAMES)
    expect(described_class.definitions(role: "coordinator").map { _1[:name] }).to eq([ "get_next_actions" ])
  end

  it "exposes the same five tools in MCP shape" do
    expect(described_class.mcp_definitions.map { _1[:name] }).to eq(described_class::NAMES)
    expect(described_class.mcp_definitions).to all(include(:name, :description, :inputSchema))
  end

  it "get_funnel returns the Alpha funnel" do
    r = described_class.call("get_funnel", { "range" => "30d" }, agency: agency, user: owner)
    expect(r[:stages].map { _1[:count] }).to eq([ 10, 5, 4, 3, 2, 1 ])
    expect(r[:kpis][:qualified][:value]).to eq(3)
    expect(r[:kpis][:unique_people]).to eq(10)
  end

  it "get_channel_performance supports a channel filter" do
    r = described_class.call("get_channel_performance", { "channel" => "Facebook" }, agency: agency, user: owner)
    expect(r[:kpis]).to eq(leads: 3, qualified: 2, rate: 66.7)
  end

  it "get_channel_performance lists every channel without a filter" do
    r = described_class.call("get_channel_performance", {}, agency: agency, user: owner)
    expect(r[:rows].map { _1[:channel] }).to include("Facebook", "Google")
  end

  it "get_next_actions strips surnames and caps items" do
    r = described_class.call("get_next_actions", {}, agency: agency, user: owner)
    names = r[:queues].flat_map { _1[:items] }.map { _1[:first_name] }
    expect(names).to match_array(%w[L4 L3 L7 L10])
    expect(r.to_json).not_to include("Alpha")
  end

  it "rejects unknown tools, bad input and tools a coordinator may not call" do
    expect { described_class.call("drop_tables", {}, agency: agency, user: owner) }.to raise_error(Agent::Tools::Error, /unknown_tool/)
    expect { described_class.call("get_funnel", { "range" => "7d" }, agency: agency, user: owner) }.to raise_error(Agent::Tools::Error, /bad_input/)
    expect { described_class.call("get_funnel", {}, agency: agency, user: dana) }.to raise_error(Agent::Tools::Error, /tool_not_allowed/)
  end

  it "scopes a coordinator's next actions to themselves even if asked otherwise" do
    r = described_class.call("get_next_actions", { "coordinator" => "Priya Shah" }, agency: agency, user: dana)
    expect(r[:queues].flat_map { _1[:items] }.size).to eq(3)
  end

  it "rejects every owner-only tool for a coordinator" do
    %w[get_funnel get_channel_performance get_dropoff_reasons].each do |name|
      expect { described_class.call(name, {}, agency: agency, user: dana) }
        .to raise_error(Agent::Tools::Error, /tool_not_allowed/)
    end
  end

  it "never accepts an agency argument" do
    expect(described_class.definitions(role: "owner").flat_map { _1[:input_schema][:properties].keys }).not_to include("agency", "agency_id")
  end
end

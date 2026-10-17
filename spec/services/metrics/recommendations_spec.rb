require "rails_helper"

RSpec.describe Metrics::Recommendations do
  let(:agency) { create(:agency, slug: "alpha", qualified_milestone: "consult_attended") }
  before { Current.agency = agency; AlphaScenario.load!(agency); AlphaSpend.load!(agency) }

  subject(:cards) { described_class.call(agency: agency, range: "30d") }

  it "returns deterministic cards ranked by leads affected" do
    expect(cards.map { _1[:id] }).to eq(%w[funnel_leak no_shows])
    expect(cards.first).to include(area: "process", cta: { label: "Open funnel", route: "/funnel" })
    expect(cards.first[:impact]).to eq("5 leads stalled")
    expect(cards.last[:ask][:question]).to match(/no-show/i)
  end

  it "adds the unattributed card at 15% or more" do
    Lead.where(first_name: %w[L5 L6]).update_all(channel: "Unknown", source_raw: nil)
    expect(described_class.call(agency: agency, range: "30d").map { _1[:id] }).to include("unattributed")
  end

  it "never exceeds four cards" do
    expect(cards.size).to be <= 4
  end

  it "returns nothing without a snapshot" do
    expect(described_class.call(agency: create(:agency), range: "30d")).to eq([])
  end
end

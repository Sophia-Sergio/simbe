require "rails_helper"

RSpec.describe Metrics::Summary do
  let(:agency) { create(:agency, slug: "alpha", qualified_milestone: "consult_attended") }
  before { Current.agency = agency; AlphaScenario.load!(agency); AlphaSpend.load!(agency) }

  subject(:s) { described_class.call(agency: agency, range: "30d") }

  it "counts leads and qualified under the agency definition" do
    expect(s[:kpis][:leads][:value]).to eq(10)
    expect(s[:kpis][:qualified][:value]).to eq(3)
    expect(s[:kpis][:qualified_rate][:value]).to eq(30.0)
    expect(s[:kpis][:qualified_rate][:low_sample]).to be(true)
    expect(s[:kpis][:leads][:delta]).to be_nil # no leads in the previous window
  end

  it "divides all spend by qualified" do
    expect(s[:kpis][:cost_per_qualified][:value_cents]).to eq(28_333) # 85_000 / 3, rounded
    expect(s[:spend_source]).to eq("import")
  end

  it "ranks channels with spend and at least one qualified lead" do
    expect(s[:cost_by_channel]).to eq([ { channel: "Facebook", cost_per_qualified_cents: 15_000, flag: "best" } ])
  end

  it "reports the biggest leak from the funnel" do
    expect(s[:biggest_leak]).to eq(from_stage: "Inquiry", to_stage: "Application", lost: 5, pct_lost: 50.0)
  end

  it "follows a changed definition immediately" do
    agency.update!(qualified_milestone: "records")
    expect(described_class.call(agency: agency, range: "30d")[:kpis][:qualified][:value]).to eq(2)
    agency.update!(qualified_milestone: "application_submitted")
    expect(described_class.call(agency: agency, range: "30d")[:kpis][:qualified][:value]).to eq(4)
    agency.update!(qualified_milestone: "accepted")
    expect(described_class.call(agency: agency, range: "30d")[:kpis][:qualified][:value]).to eq(1)
  end

  it "returns the snapshot and range" do
    snapshot = Snapshot.for_agency(agency).order(created_at: :desc).first
    expect(s[:snapshot]).to eq(id: snapshot.id, as_of: snapshot.as_of.utc)
    expect(s[:range]).to eq("30d")
  end

  it "returns zero KPIs without a snapshot" do
    empty = described_class.call(agency: create(:agency), range: "30d")
    expect(empty[:snapshot]).to be_nil
    expect(empty[:kpis][:leads][:value]).to eq(0)
    expect(empty[:kpis][:cost_per_qualified][:value_cents]).to be_nil
    expect(empty[:biggest_leak]).to be_nil
  end

  it "ignores spend outside the window" do
    AdSpendDay.create!(agency: agency, date: "2025-01-01", platform: "meta", channel: "Facebook", campaign: "c-a", spend_cents: 999_999, source: "import")
    expect(s[:kpis][:cost_per_qualified][:value_cents]).to eq(28_333)
  end

  it "does not double count a sample row beside real spend for the same day" do
    AdSpendDay.create!(agency: agency, date: "2026-09-23", platform: "meta", channel: "Instagram",
                       campaign: "c-b", spend_cents: 20_000, source: "import")
    AdSpendDay.create!(agency: agency, date: "2026-09-23", platform: "meta", channel: "Instagram",
                       campaign: "c-z", spend_cents: 5_000, source: "sample")
    # 85_000 AlphaSpend + 20_000 real, ignoring the shadowed 5_000 sample; ÷ 3 qualified.
    expect(described_class.call(agency: agency, range: "30d")[:kpis][:cost_per_qualified][:value_cents]).to eq(35_000)
  end
end

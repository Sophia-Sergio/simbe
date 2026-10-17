require "rails_helper"

RSpec.describe Metrics::Channels do
  let(:agency) { create(:agency, slug: "alpha", qualified_milestone: "consult_attended") }
  before { Current.agency = agency; AlphaScenario.load!(agency); AlphaSpend.load!(agency) }

  subject(:result) { described_class.call(agency: agency, range: "30d") }

  it "returns the channel table" do
    rows = result[:rows].index_by { _1[:channel] }
    expect(rows.transform_values { [ _1[:leads], _1[:qualified] ] }).to eq(
      "Facebook" => [ 3, 2 ], "Google" => [ 3, 0 ], "Instagram" => [ 1, 0 ],
      "Referral" => [ 1, 1 ], "TikTok" => [ 1, 0 ], "Unknown" => [ 1, 0 ])
    expect(rows["Facebook"][:cost_per_qualified_cents]).to eq(15_000)
    expect(rows["Facebook"][:flag]).to eq("best")
    expect(rows["Google"][:cost_per_qualified_cents]).to be_nil
    expect(rows["Referral"][:spend_cents]).to be_nil
    expect(result[:basis]).to eq("cost")
  end

  it "reports unattributed and out-of-area shares" do
    ins = result[:insights]
    expect(ins[:unattributed]).to eq(count: 1, pct: 10.0)
    expect(ins[:out_of_area]).to eq(count: 0, pct: 0.0, main_states: %w[CA ID])
  end

  it "falls back to rate basis when no channel has spend" do
    AdSpendDay.where(agency_id: agency.id).delete_all
    r = described_class.call(agency: agency, range: "30d")
    expect(r[:basis]).to eq("rate")
    expect(r[:rows].find { _1[:flag] == "best" }[:channel]).to eq("Referral")
  end

  it "orders rows by leads desc then channel asc and flags small samples" do
    expect(result[:rows].map { _1[:channel] }).to eq(%w[Facebook Google Instagram Referral TikTok Unknown])
    expect(result[:rows]).to all(include(low_sample: true))
  end

  it "prefers real spend over a sample row for the same channel and day" do
    AdSpendDay.create!(agency: agency, date: "2026-09-23", platform: "meta", channel: "Instagram",
                       campaign: "c-b", spend_cents: 20_000, source: "import")
    AdSpendDay.create!(agency: agency, date: "2026-09-23", platform: "meta", channel: "Instagram",
                       campaign: "c-z", spend_cents: 5_000, source: "sample")
    rows = described_class.call(agency: agency, range: "30d")[:rows].index_by { _1[:channel] }
    expect(rows["Instagram"][:spend_cents]).to eq(30_000) # 10_000 AlphaSpend + 20_000 real, not + 5_000 sample
  end

  it "returns an empty table and zero insights without a snapshot" do
    r = described_class.call(agency: create(:agency), range: "30d")
    expect(r[:rows]).to eq([])
    expect(r[:basis]).to eq("rate")
    expect(r[:insights][:unattributed]).to eq(count: 0, pct: 0.0)
    expect(r[:insights][:out_of_area]).to eq(count: 0, pct: 0.0, main_states: [])
  end
end

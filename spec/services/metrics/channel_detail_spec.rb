require "rails_helper"

RSpec.describe Metrics::ChannelDetail do
  let(:agency) { create(:agency, slug: "alpha", qualified_milestone: "consult_attended") }
  before { Current.agency = agency; AlphaScenario.load!(agency); AlphaSpend.load!(agency) }

  subject(:detail) { described_class.call(agency: agency, range: "30d", channel: "Facebook") }

  it "lists campaigns for a channel" do
    expect(detail[:kpis]).to include(leads: 3, qualified: 2, rate: 66.7, spend_cents: 30_000, cost_per_qualified_cents: 15_000)
    expect(detail[:campaigns]).to eq([ { campaign: "c-a", ads: 0, leads: 3, qualified: 2, rate: 66.7, spend_cents: 30_000, cost_per_qualified_cents: 15_000 } ])
  end

  it "reports a channel with no spend as nil cost" do
    d = described_class.call(agency: agency, range: "30d", channel: "Referral")
    expect(d[:kpis]).to include(leads: 1, qualified: 1, rate: 100.0, spend_cents: nil, cost_per_qualified_cents: nil)
  end

  it "404s an unknown channel" do
    expect { described_class.call(agency: agency, range: "30d", channel: "Podcast") }.to raise_error(ActiveRecord::RecordNotFound)
  end

  it "prefers real spend over a sample row for the same channel and day" do
    AdSpendDay.create!(agency: agency, date: "2026-09-20", platform: "meta", channel: "Facebook",
                       campaign: "c-z", spend_cents: 9_000, source: "import")
    AdSpendDay.create!(agency: agency, date: "2026-09-20", platform: "meta", channel: "Facebook",
                       campaign: "c-a", spend_cents: 5_000, source: "sample")
    campaigns = described_class.call(agency: agency, range: "30d", channel: "Facebook")[:campaigns]
    expect(campaigns.find { _1[:campaign] == "c-a" }[:spend_cents]).to eq(30_000) # not + 5_000 sample
  end
end

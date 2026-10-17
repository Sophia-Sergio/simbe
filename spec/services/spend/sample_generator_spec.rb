require "rails_helper"

RSpec.describe Spend::SampleGenerator do
  let(:agency) { create(:agency, slug: "alpha") }
  before { Current.agency = agency; AlphaScenario.load!(agency) }

  it "creates sample spend only for paid channels and is deterministic" do
    described_class.call(agency: agency)
    first = AdSpendDay.order(:date, :channel, :campaign).pluck(:date, :channel, :campaign, :spend_cents)
    expect(AdSpendDay.distinct.pluck(:channel)).to match_array(%w[Facebook Instagram Google])
    expect(AdSpendDay.distinct.pluck(:source)).to eq([ "sample" ])
    described_class.call(agency: agency)
    expect(AdSpendDay.order(:date, :channel, :campaign).pluck(:date, :channel, :campaign, :spend_cents)).to eq(first)
  end

  it "covers every paid channel/campaign/day that has at least one lead" do
    described_class.call(agency: agency)
    keys = AdSpendDay.pluck(:channel, :campaign, :date)
    # Facebook c-a on 09-20/21/22, Instagram c-b on 09-23, Google c-c on 09-24/25/28.
    expect(keys).to match_array(
      [ [ "Facebook", "c-a", Date.new(2026, 9, 20) ], [ "Facebook", "c-a", Date.new(2026, 9, 21) ],
        [ "Facebook", "c-a", Date.new(2026, 9, 22) ], [ "Instagram", "c-b", Date.new(2026, 9, 23) ],
        [ "Google", "c-c", Date.new(2026, 9, 24) ], [ "Google", "c-c", Date.new(2026, 9, 25) ],
        [ "Google", "c-c", Date.new(2026, 9, 28) ] ]
    )
  end

  it "replaces only its own sample rows and leaves import/connected spend alone" do
    AdSpendDay.create!(agency: agency, date: "2026-09-01", platform: "meta", channel: "Facebook",
                       campaign: "imported", spend_cents: 123_456, source: "import")
    described_class.call(agency: agency)
    described_class.call(agency: agency)
    expect(AdSpendDay.find_by(campaign: "imported").spend_cents).to eq(123_456)
    expect(AdSpendDay.where(source: "sample").count).to eq(7)
  end

  it "skips a channel/campaign/day that already has real spend, so it is never double counted" do
    AdSpendDay.create!(agency: agency, date: "2026-09-20", platform: "meta", channel: "Facebook",
                       campaign: "c-a", spend_cents: 12_345, source: "import")
    described_class.call(agency: agency)
    expect(AdSpendDay.where(source: "sample", channel: "Facebook", campaign: "c-a", date: "2026-09-20")).to be_empty
    expect(AdSpendDay.where(source: "import").sum(:spend_cents)).to eq(12_345)
    expect(AdSpendDay.where(source: "sample").count).to eq(6) # 7 paid groups minus the covered one
  end

  it "labels a lead with no campaign as (untagged)" do
    Lead.where(first_name: "L1").update_all(campaign: nil)
    described_class.call(agency: agency)
    expect(AdSpendDay.where(source: "sample", campaign: Metrics::Base::UNTAGGED).count).to eq(1)
  end

  it "never writes another agency's spend" do
    other = create(:agency, slug: "beta")
    Current.agency = other
    AdSpendDay.create!(agency: other, date: "2026-09-20", platform: "meta", channel: "Facebook",
                       campaign: "c-a", spend_cents: 999, source: "import")
    Current.agency = agency
    described_class.call(agency: agency)
    Current.agency = other
    expect(AdSpendDay.where(source: "import").sum(:spend_cents)).to eq(999)
  end
end

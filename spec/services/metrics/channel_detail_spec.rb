require "rails_helper"

RSpec.describe Metrics::ChannelDetail do
  let(:agency) { create(:agency, slug: "alpha", qualified_milestone: "consult_attended") }
  before { Current.agency = agency; AlphaScenario.load!(agency) }

  subject(:detail) { described_class.call(agency: agency, range: "30d", channel: "Facebook") }

  it "lists campaigns for a channel" do
    expect(detail[:kpis]).to eq(leads: 3, qualified: 2, rate: 66.7)
    expect(detail[:campaigns]).to eq([ { campaign: "c-a", ads: 0, leads: 3, qualified: 2, rate: 66.7 } ])
  end

  it "404s an unknown channel" do
    expect { described_class.call(agency: agency, range: "30d", channel: "Podcast") }.to raise_error(ActiveRecord::RecordNotFound)
  end

  it "reports a lead with no campaign as (untagged)" do
    Lead.where(first_name: "L1").update_all(campaign: nil)
    campaigns = described_class.call(agency: agency, range: "30d", channel: "Facebook")[:campaigns]
    expect(campaigns.find { _1[:campaign] == Metrics::Base::UNTAGGED }[:leads]).to eq(1)
  end
end

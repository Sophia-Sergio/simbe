require "rails_helper"

RSpec.describe Metrics::Channels do
  let(:agency) { create(:agency, slug: "alpha", qualified_milestone: "consult_attended") }
  before { Current.agency = agency; AlphaScenario.load!(agency) }

  subject(:result) { described_class.call(agency: agency, range: "30d") }

  it "returns the channel table" do
    rows = result[:rows].index_by { _1[:channel] }
    expect(rows.transform_values { [ _1[:leads], _1[:qualified] ] }).to eq(
      "Facebook" => [ 3, 2 ], "Google" => [ 3, 0 ], "Instagram" => [ 1, 0 ],
      "Referral" => [ 1, 1 ], "TikTok" => [ 1, 0 ], "Unknown" => [ 1, 0 ])
    expect(rows["Facebook"].keys).to contain_exactly(:channel, :leads, :qualified, :rate, :flag, :low_sample)
    expect(result.keys).to contain_exactly(:rows, :insights)
  end

  it "reports unattributed and out-of-area shares" do
    ins = result[:insights]
    expect(ins[:unattributed]).to eq(count: 1, pct: 10.0)
    expect(ins[:out_of_area]).to eq(count: 0, pct: 0.0, main_states: %w[CA ID])
  end

  it "flags the best and worst channel by qualified rate" do
    flags = result[:rows].to_h { [ _1[:channel], _1[:flag] ] }
    expect(flags.values.compact.sort).to eq(%w[best worst])
    expect(flags["Referral"]).to eq("best")
  end

  it "orders rows by leads desc then channel asc and flags small samples" do
    expect(result[:rows].map { _1[:channel] }).to eq(%w[Facebook Google Instagram Referral TikTok Unknown])
    expect(result[:rows]).to all(include(low_sample: true))
  end

  it "returns an empty table and zero insights without a snapshot" do
    r = described_class.call(agency: create(:agency), range: "30d")
    expect(r[:rows]).to eq([])
    expect(r[:insights][:unattributed]).to eq(count: 0, pct: 0.0)
    expect(r[:insights][:out_of_area]).to eq(count: 0, pct: 0.0, main_states: [])
  end

  it "does not carry a campaign placeholder it never uses" do
    # The channel table aggregates by channel; the blank-campaign label lives where campaigns
    # are actually shown (Metrics::Base::UNTAGGED, used by ChannelDetail).
    expect(described_class.const_defined?(:UNTAGGED)).to be(false)
  end
end

require "rails_helper"

RSpec.describe Leads::Board do
  let(:agency) { create(:agency, slug: "alpha", qualified_milestone: "consult_attended") }
  let!(:owner) { create(:user, agency: agency) }
  let!(:dana) { create(:user, :coordinator, agency: agency, coordinator_name: "Dana Ortiz") }
  before { Current.agency = agency; AlphaScenario.load!(agency) }

  it "places every board lead in exactly one column" do
    columns = described_class.call(user: owner)[:columns]
    expect(columns.transform_values { _1[:count] }).to eq(action_needed: 4, in_application: 0, consult: 0, qualified: 3)
    expect(columns[:qualified][:leads].map { _1[:name] }).to match_array([ "L1 Alpha", "L2 Alpha", "L8 Alpha" ])
  end

  it "caps each column at 25 cards but reports the true count" do
    extra = 30.times.map do |n|
      Lead.create!(external_id: SecureRandom.uuid, lead_created_at: Time.utc(2026, 9, 1) + n, first_name: "Extra#{n}",
                   last_name: "Alpha", channel: "Unknown", current_stage: "inquiry", outcome: "open")
    end
    Snapshot::Facts.call(agency.id)
    Current.agency = agency
    column = described_class.call(user: owner)[:columns][:action_needed]
    expect(column[:leads].size).to eq(25)
    expect(column[:count]).to be >= 30
    expect(extra.size).to eq(30)
  end

  it "re-columns when the qualified definition changes" do
    agency.update!(qualified_milestone: "records")
    columns = described_class.call(user: owner)[:columns]
    expect(columns[:qualified][:count]).to eq(2)   # L1, L8
    expect(columns[:consult][:count]).to eq(1)     # L2 is now open at consult
  end

  it "scopes a coordinator to their own leads" do
    columns = described_class.call(user: dana)[:columns]
    expect(columns.values.flat_map { _1[:leads] }.map { _1[:name] }).to match_array([ "L3 Alpha", "L4 Alpha", "L10 Alpha" ])
  end

  it "filters by coordinator for an owner" do
    columns = described_class.call(user: owner, coordinator: "Priya Shah")[:columns]
    expect(columns.values.flat_map { _1[:leads] }.map { _1[:name] }).to match_array([ "L7 Alpha", "L8 Alpha" ])
  end

  it "builds a 6-segment bar" do
    card = described_class.call(user: owner)[:columns][:action_needed][:leads].find { _1[:name] == "L4 Alpha" }
    expect(card[:segments]).to eq(%w[done done action todo todo todo])
  end

  it "marks the furthest stage of an unqueued open lead as current" do
    card = described_class.call(user: owner)[:columns][:qualified][:leads].find { _1[:name] == "L2 Alpha" }
    expect(card[:segments]).to eq(%w[done done done current todo todo])
  end

  it "returns the lead's age from the screener without exposing other answers" do
    card = described_class.call(user: owner)[:columns][:qualified][:leads].find { _1[:name] == "L2 Alpha" }
    expect(card.keys).not_to include(:answers, :screener_answers)
    expect(card[:age]).to eq(29)
  end

  it "treats a non-scalar coordinator filter as absent" do
    expect(described_class.call(user: owner, coordinator: [ "Priya Shah" ])[:columns][:qualified][:count]).to eq(3)
    expect(described_class.call(user: owner, coordinator: { "a" => "b" })[:columns][:qualified][:count]).to eq(3)
  end

  it "returns empty columns without a snapshot" do
    empty = create(:agency)
    Current.agency = empty
    expect(described_class.call(user: create(:user, agency: empty))[:columns].values.map { _1[:count] }).to eq([ 0, 0, 0, 0 ])
  end
end

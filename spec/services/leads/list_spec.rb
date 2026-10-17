require "rails_helper"

RSpec.describe Leads::List do
  let(:agency) { create(:agency, slug: "alpha", qualified_milestone: "consult_attended") }
  let!(:owner) { create(:user, agency: agency) }
  let!(:dana) { create(:user, :coordinator, agency: agency, coordinator_name: "Dana Ortiz") }
  before { Current.agency = agency; AlphaScenario.load!(agency) }

  def names(result = described_class.call(user: owner))
    result[:leads].map { _1[:name] }
  end

  it "lists the open leads newest first with their card status" do
    expect(names).to eq([ "L7 Alpha", "L8 Alpha", "L4 Alpha", "L3 Alpha", "L2 Alpha" ])
    expect(described_class.call(user: owner)[:leads].first[:status]).to eq(key: "text_back_now", label: "Text back now", tone: "danger")
    expect(described_class.call(user: owner)[:next_cursor]).to be_nil
  end

  it "filters by status" do
    expect(names(described_class.call(user: owner, status: "closed"))).to match_array([ "L5 Alpha", "L6 Alpha", "L9 Alpha" ])
    expect(names(described_class.call(user: owner, status: "paused"))).to eq([ "L10 Alpha" ])
    expect(names(described_class.call(user: owner, status: "accepted"))).to eq([ "L1 Alpha" ])
    expect(names(described_class.call(user: owner, status: "all")).size).to eq(10)
  end

  it "searches names and email with a literal, wildcard-escaped contains" do
    expect(names(described_class.call(user: owner, q: "l4"))).to eq([ "L4 Alpha" ])
    expect(names(described_class.call(user: owner, q: "l4.alpha@example.com"))).to eq([ "L4 Alpha" ])
    expect(names(described_class.call(user: owner, q: "%"))).to eq([])
    expect(names(described_class.call(user: owner, q: "_"))).to eq([])
  end

  it "caps a search without a cursor at 8 results" do
    expect(names(described_class.call(user: owner, status: "all", q: "alpha")).size).to eq(8)
    expect(described_class.call(user: owner, status: "all", q: "alpha")[:next_cursor]).to be_nil
  end

  it "filters by coordinator for an owner and scopes a coordinator to their own leads" do
    expect(names(described_class.call(user: owner, coordinator: "Priya Shah"))).to eq([ "L7 Alpha", "L8 Alpha" ])
    expect(names(described_class.call(user: dana))).to eq([ "L4 Alpha", "L3 Alpha" ])
  end

  it "keyset-pages by (lead_created_at desc, id) with no overlap" do
    first = described_class.call(user: owner, per: 3)
    expect(first[:leads].map { _1[:name] }).to eq([ "L7 Alpha", "L8 Alpha", "L4 Alpha" ])
    expect(first[:next_cursor]).to be_present

    second = described_class.call(user: owner, per: 3, cursor: first[:next_cursor])
    expect(second[:leads].map { _1[:name] }).to eq([ "L3 Alpha", "L2 Alpha" ])
    expect(second[:next_cursor]).to be_nil
    expect(first[:leads].map { _1[:id] } & second[:leads].map { _1[:id] }).to be_empty
  end

  it "treats a malformed cursor as absent instead of raising" do
    first_page = described_class.call(user: owner)
    expect(described_class.call(user: owner, cursor: "2026-01-01T00:00:00Z|not-a-uuid")).to eq(first_page)
    expect(described_class.call(user: owner, cursor: "not-a-cursor")).to eq(first_page)
    expect(described_class.call(user: owner, cursor: "2026-99-99T00:00:00Z|aaaaaaaa-0000-4000-8000-000000000007")).to eq(first_page)
  end

  it "treats non-scalar filter values as absent" do
    open_names = names
    expect(names(described_class.call(user: owner, q: [ "l4" ]))).to eq(open_names)
    expect(names(described_class.call(user: owner, q: { "a" => "b" }))).to eq(open_names)
    expect(names(described_class.call(user: owner, status: [ "closed" ]))).to eq(open_names)
    expect(names(described_class.call(user: owner, coordinator: [ "Priya Shah" ]))).to eq(open_names)
    expect(names(described_class.call(user: owner, coordinator: { "a" => "b" }))).to eq(open_names)
    expect(names(described_class.call(user: owner, cursor: [ "x" ]))).to eq(open_names)
    expect(described_class.call(user: owner, per: [ "3" ])[:leads].size).to eq(open_names.size)
  end

  it "treats an unknown status as the default (open): the contract declares no 4xx for a bad enum value" do
    open_names = names
    expect(names(described_class.call(user: owner, status: "bogus"))).to eq(open_names)
    expect(names(described_class.call(user: owner, status: ""))).to eq(open_names)
  end

  it "returns an empty list without a snapshot" do
    empty = create(:agency)
    Current.agency = empty
    expect(described_class.call(user: create(:user, agency: empty))).to eq(leads: [], next_cursor: nil)
  end
end

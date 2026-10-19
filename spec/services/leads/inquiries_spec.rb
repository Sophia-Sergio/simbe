require "rails_helper"

# A lead is one inquiry; the same person can inquire again (linked-inquiries spec, decisions 4-5).
RSpec.describe Leads::Overlap do
  def inquiry(id, created, outcome: "open", closed_at: nil)
    { id: id, created_at: Time.utc(2026, 1, created), outcome: outcome,
      outcome_updated_at: closed_at && Time.utc(2026, 1, closed_at) }
  end

  it "has no pair when the earlier inquiry was closed before the later one was created" do
    pairs = described_class.pairs([ inquiry("a", 1, outcome: "unresponsive", closed_at: 5), inquiry("b", 10) ])

    expect(pairs).to eq([])
  end

  it "pairs an earlier inquiry that was still open when the later one was created" do
    expect(described_class.pairs([ inquiry("a", 1), inquiry("b", 10) ])).to eq([ %w[a b] ])
  end

  it "pairs every two inquiries of a person with three open ones" do
    pairs = described_class.pairs([ inquiry("c", 20), inquiry("a", 1), inquiry("b", 10) ])

    expect(pairs).to eq([ %w[a b], %w[a c], %w[b c] ])
  end

  it "orders inquiries created at the same instant by id" do
    expect(described_class.pairs([ inquiry("b", 1), inquiry("a", 1) ])).to eq([ %w[a b] ])
  end

  it "treats a close at the very instant the later inquiry was created as still open" do
    pairs = described_class.pairs([ inquiry("a", 1, outcome: "accepted", closed_at: 10), inquiry("b", 10) ])

    expect(pairs).to eq([ %w[a b] ])
  end

  it "treats a closed outcome with no close date as still open" do
    pairs = described_class.pairs([ inquiry("a", 1, outcome: "unresponsive"), inquiry("b", 10) ])

    expect(pairs).to eq([ %w[a b] ])
  end

  it "does not treat a paused inquiry as closed" do
    pairs = described_class.pairs([ inquiry("a", 1, outcome: "paused", closed_at: 5), inquiry("b", 10) ])

    expect(pairs).to eq([ %w[a b] ])
  end
end

RSpec.describe Leads::Inquiries do
  let(:agency) { create(:agency, slug: "alpha", qualified_milestone: "consult_attended") }
  let(:owner) { create(:user, agency: agency) }
  let(:dana) { create(:user, :coordinator, agency: agency, coordinator_name: "Dana Ortiz") }

  before do
    Current.agency = agency
    AlphaScenario.load!(agency)
  end

  def lead(name) = Lead.find_by!(first_name: name)

  # L1 (Jess, accepted 09-26), L2 (Jess, open) and L3 (Dana, open) become one person.
  def link_l1_l2_l3
    [ lead("L2"), lead("L3") ].each { |other| other.update_columns(person_id: lead("L1").person_id) }
  end

  it "lists a person's other inquiries oldest first, never the lead itself, with only the allowed fields" do
    link_l1_l2_l3

    result = described_class.call(user: owner, lead: lead("L2"))

    expect(result[:other_inquiries].map { _1[:id] }).to eq([ lead("L1").external_id, lead("L3").external_id ])
    expect(result[:other_inquiries].first).to eq(
      id: lead("L1").external_id, created_at: lead("L1").lead_created_at, stage: "accepted",
      status: Leads::Status.call(outcome: "accepted", queue: nil), outcome_reason: nil,
      channel: "Facebook", campaign: "c-a", coordinator: "Jess Kim"
    )
  end

  it "reports an overlap when another inquiry was still open at the time" do
    link_l1_l2_l3

    expect(described_class.call(user: owner, lead: lead("L2"))[:open_overlap]).to be(true)
  end

  it "reports no overlap when the earlier inquiry was closed before the later one began" do
    lead("L2").update_columns(person_id: lead("L1").person_id)
    lead("L1").update_columns(outcome_updated_at: Time.utc(2026, 9, 20, 12))

    expect(described_class.call(user: owner, lead: lead("L2"))).to include(open_overlap: false)
    expect(described_class.call(user: owner, lead: lead("L1"))).to include(open_overlap: false)
  end

  it "gives a lead on its own person nothing" do
    expect(described_class.call(user: owner, lead: lead("L5"))).to eq(other_inquiries: [], open_overlap: false)
  end

  it "shows a coordinator only the inquiries assigned to them, yet still reports the overlap" do
    link_l1_l2_l3

    result = described_class.call(user: dana, lead: lead("L3"))

    expect(result[:other_inquiries]).to eq([])
    expect(result[:open_overlap]).to be(true)
  end
end

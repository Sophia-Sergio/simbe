require "rails_helper"

# Coordinator performance (detail reference task 5). Hand-computed expectations on Alpha v1:
# Dana 4 leads (L3 no-show, L4 application, L5 not eligible, L10 paused) -> 0 qualified, overdue 2;
# Jess 3 (L1, L2 attended, L9) -> 2 qualified; Priya 3 (L6, L7, L8) -> 1 qualified, overdue 1.
RSpec.describe Leads::CoordinatorStats do
  let(:agency) { create(:agency, slug: "alpha", qualified_milestone: "consult_attended", timezone: "America/Los_Angeles") }

  before do
    Current.agency = agency
    AlphaScenario.load!(agency)
  end

  it "summarizes each coordinator with leads, share, qualified, median reply and overdue" do
    rows = described_class.call(agency: agency).index_by { _1[:name] }
    expect(rows["Dana Ortiz"]).to include(leads: 4, share_pct: 40.0, qualified: 0, overdue: 2)
    expect(rows["Jess Kim"]).to include(leads: 3, share_pct: 30.0, qualified: 2, qualified_rate: 66.7, overdue: 0)
    expect(rows["Priya Shah"]).to include(leads: 3, qualified: 1, qualified_rate: 33.3, overdue: 1)
    expect(rows["Dana Ortiz"][:first_reply_minutes]).to eq(22.5) # median of 120, 10, 20, 25
    expect(rows["Priya Shah"][:first_reply_minutes]).to eq(45.0) # only L8 has an outbound contact
  end

  it "orders rows by leads desc, then name" do
    expect(described_class.call(agency: agency).map { _1[:name] }).to eq([ "Dana Ortiz", "Jess Kim", "Priya Shah" ])
  end

  it "flags needs_support above the threshold" do
    stub_const("Leads::CoordinatorStats::NEEDS_SUPPORT_THRESHOLD", 1)
    expect(described_class.call(agency: agency).index_by { _1[:name] }["Dana Ortiz"][:status]).to eq("needs_support")
  end

  it "is on_track at the default threshold of 8" do
    expect(described_class.call(agency: agency).map { _1[:status] }.uniq).to eq([ "on_track" ])
  end

  it "returns detail with the leads needing action in queue order and 404s an unknown name" do
    detail = described_class.detail(agency: agency, name: "Dana Ortiz")
    expect(detail[:needs_action].map { _1[:name] }).to eq([ "L4 Alpha", "L3 Alpha", "L10 Alpha" ])
    expect(detail[:needs_action].first).to include(queue: "nudge_applications", age_minutes: 11630)
    expect(detail[:kpis]).to eq(leads: 4, qualified: 0, qualified_rate: 0.0, first_reply_minutes: 22.5)
    expect { described_class.detail(agency: agency, name: "Nobody") }.to raise_error(ActiveRecord::RecordNotFound)
  end

  it "returns no rows for an agency without leads" do
    expect(described_class.call(agency: create(:agency))).to eq([])
  end
end

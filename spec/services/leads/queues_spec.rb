require "rails_helper"

RSpec.describe Leads::Queues do
  let(:agency) { create(:agency, slug: "alpha", timezone: "America/Los_Angeles") }
  before { Current.agency = agency; AlphaScenario.load!(agency) }

  it "assigns each queued lead to exactly one queue" do
    rows = described_class.call(agency: agency)
    expect(rows.to_h { [ _1[:name], _1[:queue] ] }).to eq(
      "L4 Alpha" => "nudge_applications", "L3 Alpha" => "rebook_consults",
      "L7 Alpha" => "text_back_now", "L10 Alpha" => "paused_due_back")
  end

  it "computes ages from the snapshot as_of and orders oldest first" do
    rows = described_class.call(agency: agency)
    expect(rows.find { _1[:name] == "L7 Alpha" }[:age_minutes]).to eq(2 * 24 * 60 + 2 * 60) # created 09-29T10:00Z
    expect(rows.map { _1[:age_minutes] }).to eq(rows.map { _1[:age_minutes] }.sort.reverse)
  end

  it "writes readable reasons" do
    by = described_class.call(agency: agency).index_by { _1[:name] }
    expect(by["L7 Alpha"][:reason]).to eq("New lead · no message sent yet")
    expect(by["L4 Alpha"][:reason]).to match(/Application 40% · quiet 8d/)
    expect(by["L3 Alpha"][:reason]).to match(/No-show Sep 28 · not rebooked/)
    expect(by["L10 Alpha"][:reason]).to match(/Paused until Sep 20 · due back/)
  end

  it "filters by coordinator" do
    expect(described_class.call(agency: agency, coordinator: "Priya Shah").map { _1[:name] }).to eq([ "L7 Alpha" ])
  end

  it "excludes closed, accepted and already-attended leads and returns [] without a snapshot" do
    names = described_class.call(agency: agency).map { _1[:name] }
    expect(names).not_to include("L1 Alpha", "L5 Alpha", "L6 Alpha", "L2 Alpha", "L8 Alpha")
    expect(described_class.call(agency: create(:agency))).to eq([])
  end

  it "moves a nudged lead out of the queue when contacted within 24h" do
    Contact.create!(lead: Lead.find_by!(first_name: "L4"), contacted_at: Time.utc(2026, 10, 1, 9), direction: "outbound", channel: "text", contacted_by: "Dana Ortiz")
    LeadFact.find_by!(lead: Lead.find_by!(first_name: "L4")).update!(last_contact_at: Time.utc(2026, 10, 1, 9))
    expect(described_class.call(agency: agency).map { _1[:name] }).not_to include("L4 Alpha")
  end

  it "compares paused_until against the agency-local date, not the UTC date" do
    # 2026-10-01T05:00Z is still 2026-09-30 in Pacific, so a lead paused until Oct 1 is not due yet
    # (docs/conventions/database.md: convert to the agency time zone at aggregation time).
    Lead.find_by!(first_name: "L10").update!(paused_until: Date.new(2026, 10, 1))
    rows = described_class.call(agency: agency, as_of: Time.utc(2026, 10, 1, 5, 0, 0))
    expect(rows.map { _1[:name] }).not_to include("L10 Alpha")
  end

  it "uses the most recently loaded snapshot as_of, not the greatest" do
    older = Time.utc(2026, 9, 25, 12)
    Snapshot.for_agency(agency).create!(as_of: older, loaded_at: Time.current, row_counts: {}, warnings: [])
    expect(described_class.latest_as_of(agency)).to eq(older)
  end
end

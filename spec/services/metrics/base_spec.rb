require "rails_helper"

RSpec.describe Metrics::Base do
  let(:agency) { create(:agency, slug: "alpha", qualified_milestone: "consult_attended") }
  before { Current.agency = agency; AlphaScenario.load!(agency) }
  subject(:base) { described_class.new(agency: agency, range: "30d") }

  def current_snapshot = Snapshot.for_agency(agency).order(created_at: :desc).first
  def agency_zone = ActiveSupport::TimeZone[agency.timezone]

  it "rejects a range outside RANGES" do
    expect { described_class.new(agency: agency, range: "7d") }.to raise_error(Metrics::BadRange)
  end

  it "windows whole calendar days in the agency time zone, ending on the as_of's local day" do
    window = base.window
    expect(window[:to_date]).to eq(Date.new(2026, 10, 1))
    expect(window[:from_date]).to eq(Date.new(2026, 9, 2))
    expect(window[:prev_to_date]).to eq(Date.new(2026, 9, 1))
    expect(window[:prev_from_date]).to eq(Date.new(2026, 8, 3))
    expect(window[:to]).to eq(agency_zone.local(2026, 10, 1).end_of_day)
    expect(window[:from]).to eq(agency_zone.local(2026, 9, 2).beginning_of_day)
  end

  it "exposes the snapshot id and as_of" do
    snapshot = current_snapshot
    expect(base.snapshot).to eq(id: snapshot.id, as_of: snapshot.as_of.utc)
  end

  it "returns a nil snapshot and window for an agency that never loaded one" do
    empty = described_class.new(agency: create(:agency), range: "30d")
    expect(empty.snapshot).to be_nil
    expect(empty.window).to be_nil
  end

  it "picks the qualified column from the agency milestone" do
    expect(base.qualified_column).to eq("consult_attended_at")
    agency.update!(qualified_milestone: "records")
    expect(described_class.new(agency: agency, range: "30d").qualified_column).to eq("records_at")
  end

  it "binds the agency id into raw rows" do
    expect(base.rows("select :agency_id::uuid as a", {}).first[:a]).to eq(agency.id)
  end

  it "computes rates with one decimal and no divide-by-zero" do
    expect(described_class.rate(1, 0)).to eq(0.0)
    expect(described_class.rate(2, 3)).to eq(66.7)
  end

  describe "calendar-day boundaries near local midnight" do
    let(:agency) { create(:agency, slug: "pacific", timezone: "America/Los_Angeles") }
    let(:as_of) { Time.utc(2026, 10, 1, 5, 26, 42) } # 2026-09-30 22:26 Pacific

    before do
      Current.agency = agency
      Lead.where(agency_id: agency.id).delete_all # drop the Alpha rows the outer before loaded
      current_snapshot.update!(as_of: as_of)
    end

    it "excludes a lead before the first local day even though it is after the rolling instant" do
      create_lead(Time.utc(2026, 9, 1, 6, 30)) # 2026-08-31 23:30 Pacific — before the window
      create_lead(Time.utc(2026, 9, 1, 7, 30)) # 2026-09-01 00:30 Pacific — inside
      expect(leads_value).to eq(1)
    end

    it "includes a lead on the as_of's local day even though it is after the as_of instant" do
      create_lead(Time.utc(2026, 10, 1, 6, 30)) # 2026-09-30 23:30 Pacific — the as_of's own day
      expect(leads_value).to eq(1)
    end

    def create_lead(at)
      lead = Lead.create!(external_id: SecureRandom.uuid, lead_created_at: at, channel: "Unknown",
                          current_stage: "inquiry", outcome: "open")
      LeadFact.create!(lead: lead, furthest_stage: "inquiry")
    end

    def leads_value = Metrics::Summary.call(agency: agency, range: "30d")[:kpis][:leads][:value]
  end

  describe "#cached" do
    let(:store) { ActiveSupport::Cache::MemoryStore.new }
    before { allow(Rails).to receive(:cache).and_return(store) }

    def fresh_base = described_class.new(agency: agency, range: "30d")

    it "evaluates the block once per key and follows a changed definition" do
      calls = 0
      expect(base.cached("k") { calls += 1; "v" }).to eq("v")
      expect(base.cached("k") { calls += 1; "v" }).to eq("v")
      expect(calls).to eq(1)

      agency.update!(qualified_milestone: "records")
      fresh_base.cached("k") { calls += 1; "v2" }
      expect(calls).to eq(2)
    end

    it "invalidates when a new snapshot is loaded" do
      calls = 0
      base.cached("k") { calls += 1 }
      Snapshot.for_agency(agency).create!(as_of: Time.utc(2026, 10, 5, 12), loaded_at: Time.current, row_counts: {}, warnings: [])
      fresh_base.cached("k") { calls += 1 }
      expect(calls).to eq(2)
    end

    it "invalidates when the agency's spend changes" do
      calls = 0
      base.cached("k") { calls += 1 }
      AdSpendDay.create!(agency: agency, date: "2026-09-25", platform: "meta", channel: "Facebook",
                         campaign: "c-a", spend_cents: 100, source: "import")
      fresh_base.cached("k") { calls += 1 }
      expect(calls).to eq(2)
    end

    it "invalidates when spend is replaced but has the same row count" do
      AdSpendDay.create!(agency: agency, date: "2026-09-25", platform: "meta", channel: "Facebook",
                         campaign: "c-a", spend_cents: 100, source: "import")
      calls = 0
      base.cached("k") { calls += 1 }
      AdSpendDay.find_by!(campaign: "c-a").update!(spend_cents: 500)
      fresh_base.cached("k") { calls += 1 }
      expect(calls).to eq(2)
    end

    it "never serves one agency's cached value to another" do
      expect(base.cached("k") { "alpha" }).to eq("alpha")
      other = described_class.new(agency: create(:agency), range: "30d")
      expect(other.cached("k") { "beta" }).to eq("beta")
    end
  end
end

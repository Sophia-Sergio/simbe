require "rails_helper"

RSpec.describe Metrics::Base do
  let(:agency) { create(:agency, slug: "alpha", qualified_milestone: "consult_attended") }
  before { Current.agency = agency; AlphaScenario.load!(agency) }
  subject(:base) { described_class.new(agency: agency, range: "30d") }

  def current_snapshot = Snapshot.for_agency(agency).order(created_at: :desc).first

  it "rejects a range outside RANGES" do
    expect { described_class.new(agency: agency, range: "7d") }.to raise_error(Metrics::BadRange)
  end

  it "windows back from the snapshot as_of, not wall-clock" do
    snapshot = current_snapshot
    expect(base.window[:to]).to eq(snapshot.as_of)
    expect(base.window[:from]).to eq(snapshot.as_of - 30.days)
    expect(base.window[:prev_to]).to eq(base.window[:from])
    expect(base.window[:prev_from]).to eq(snapshot.as_of - 60.days)
  end

  it "exposes the snapshot id and as_of" do
    snapshot = current_snapshot
    expect(base.snapshot).to eq(id: snapshot.id, as_of: snapshot.as_of)
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

  describe "#cached" do
    let(:store) { ActiveSupport::Cache::MemoryStore.new }
    before { allow(Rails).to receive(:cache).and_return(store) }

    it "evaluates the block once per key and follows a changed definition" do
      calls = 0
      expect(base.cached("k") { calls += 1; "v" }).to eq("v")
      expect(base.cached("k") { calls += 1; "v" }).to eq("v")
      expect(calls).to eq(1)

      agency.update!(qualified_milestone: "records")
      base.cached("k") { calls += 1; "v2" }
      expect(calls).to eq(2)
    end
  end
end

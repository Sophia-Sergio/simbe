require "rails_helper"

RSpec.describe Snapshot::Progress do
  let(:user) { create(:user) }
  let(:upload) do
    SnapshotUpload.create!(agency: user.agency, user: user, status: "validating",
                           progress: { "phase" => "storing", "pct" => 0 })
  end
  let(:now) { [ 100.0 ] }

  subject(:progress) { described_class.new(upload, clock: -> { now.first }) }

  def saved
    upload.reload.progress
  end

  it "writes the first update" do
    progress.update(phase: "parsing", pct: 5)

    expect(saved).to eq("phase" => "parsing", "pct" => 5)
  end

  it "writes at most every 500 ms or +1%, and always on a phase change" do
    expect(progress.update(phase: "importing", pct: 10)).to be_present

    now[0] += 0.1
    expect(progress.update(phase: "importing", pct: 10)).to be_nil        # < 500 ms, no step
    expect(progress.update(phase: "importing", pct: 11)).to be_present    # +1%
    expect(progress.update(phase: "computing", pct: 11)).to be_present    # phase change

    now[0] += 0.6
    expect(progress.update(phase: "computing", pct: 11)).to be_present    # 500 ms passed
  end

  it "records rows_done and rows_total when given" do
    progress.update(phase: "importing", pct: 46, rows_done: 24_000, rows_total: 52_000)

    expect(saved).to eq("phase" => "importing", "pct" => 46, "rows_done" => 24_000, "rows_total" => 52_000)
  end

  it "clamps the percentage to 0..100" do
    progress.update(phase: "importing", pct: 140)
    expect(saved["pct"]).to eq(100)

    now[0] += 1
    progress.update(phase: "finalizing", pct: -3)
    expect(saved["pct"]).to eq(0)
  end

  it "clears progress on finish" do
    progress.update(phase: "importing", pct: 50)
    progress.finish

    expect(saved).to be_nil
  end

  it "refreshes the heartbeat (updated_at) on every update and on demand" do
    upload.update_column(:updated_at, 1.day.ago)
    progress.update(phase: "importing", pct: 5)
    expect(upload.reload.updated_at).to be > 1.hour.ago

    upload.update_column(:updated_at, 1.day.ago)
    progress.heartbeat
    expect(upload.reload.updated_at).to be > 1.hour.ago
  end

  it "writes the heartbeat through the given connection too" do
    connection = double("connection")
    expect(connection).to receive(:exec_update)
      .with(described_class::HEARTBEAT_SQL, "Snapshot::Progress", [ anything ])

    described_class.new(upload, connection: connection).heartbeat
  end

  it "writes through the given connection (so the import transaction does not hide progress)" do
    connection = double("connection")
    expect(connection).to receive(:exec_update)
      .with(described_class::UPDATE_SQL, "Snapshot::Progress", [ anything, anything ])

    described_class.new(upload, connection: connection).update(phase: "importing", pct: 30)
  end
end

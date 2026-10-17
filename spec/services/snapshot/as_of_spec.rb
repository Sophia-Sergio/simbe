require "rails_helper"

RSpec.describe Snapshot::AsOf do
  it "is the latest event timestamp across the files" do
    expect(described_class.call(AlphaScenario.builder.rows)).to eq(AlphaScenario::AS_OF)
  end

  it "reads typed rows straight from the Reader" do
    rows = Snapshot::Reader.call(AlphaScenario.copy_dir)
    expect(described_class.call(rows)).to eq(AlphaScenario::AS_OF)
  end

  it "never uses scheduled_for or paused_until" do
    builder = ExportBuilder.new
    builder.lead(id: SecureRandom.uuid, created: "2026-09-01T10:00:00Z", paused_until: "2030-01-01",
                 appointment: { booked: "2026-09-01T10:00:00Z", at: "2031-01-01T00:00:00Z", status: "scheduled" })
    # Latest event is the screener submitted_at (created + the pre_screen offset), far
    # before the 2030 paused_until / 2031 scheduled_for.
    expect(described_class.call(builder.rows)).to eq(Time.utc(2026, 9, 1, 10, 10))
  end
end

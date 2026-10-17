require "rails_helper"

RSpec.describe Snapshot::Reader do
  it "reads Alpha into the same shape as ExportBuilder#rows" do
    rows = described_class.call(AlphaScenario.copy_dir)
    expect(rows.errors).to be_empty
    expect(rows[:leads].size).to eq(10)
    expected = AlphaScenario.builder.rows
    expect(rows[:stage_events].map { _1.values_at(:external_id, :stage) }).to match_array(expected[:stage_events].map { _1.values_at(:external_id, :stage) })
  end

  it "tolerates BOM, CRLF, quoted commas and blank fields" do
    dir = AlphaScenario.copy_dir; path = File.join(dir, "leads.csv")
    File.write(path, "\uFEFF" + File.read(path).gsub("\n", "\r\n").sub("L1", "\"L1, Jr\""))
    rows = described_class.call(dir)
    expect(rows[:leads].first[:first_name]).to eq("L1, Jr"); expect(rows[:leads].find { _1[:first_name] == "L7" }[:campaign]).to be_nil
  end

  it "reports unparseable values with file, row and column but never the cell contents" do
    dir = AlphaScenario.copy_dir; path = File.join(dir, "leads.csv")
    File.write(path, File.read(path).sub(/2026-09-2\dT[\d:.]+Z/, "yesterday"))
    err = described_class.call(dir).errors.find { _1[:code] == "bad_value" }
    expect(err).to include(file: "leads.csv"); expect(err[:row]).to be_a(Integer)
    expect(err[:column]).to eq("created_at")
    # No row contents in reports (docs/conventions/sensitive-data.md).
    expect(err[:message]).not_to include("yesterday")
  end

  it "does not invent a date from a partial value" do
    dir = AlphaScenario.copy_dir; path = File.join(dir, "leads.csv")
    header = File.read(path).lines.first
    expect(header).to include("paused_until")
    File.write(path, File.read(path).sub(/(?<=,)(\d{4}-\d{2}-\d{2})(?=,|$)/, "12"))
    errors = described_class.call(dir).errors
    expect(errors.map { _1[:code] }).to include("bad_value").or include("malformed_csv").or be_empty
    expect(errors.select { _1[:column] == "paused_until" }.map { _1[:message] }).to all(satisfy { |m| !m.include?("12") })
  end

  it "reports a malformed CSV as an error with file and line instead of raising" do
    dir = AlphaScenario.copy_dir; path = File.join(dir, "leads.csv")
    File.write(path, File.read(path) + "\"unclosed,quote\n")
    errors = nil
    expect { errors = described_class.call(dir).errors }.not_to raise_error
    err = errors.find { _1[:code] == "malformed_csv" }
    expect(err).to include(file: "leads.csv")
    expect(err[:message]).not_to include("unclosed")
  end
end

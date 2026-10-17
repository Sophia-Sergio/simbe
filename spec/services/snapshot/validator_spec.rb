require "rails_helper"

RSpec.describe Snapshot::Validator do
  let(:agency) { create(:agency, slug: "alpha") }
  let(:dir) { AlphaScenario.copy_dir } # fresh tmp copy of v1 each call

  it "accepts the Alpha export" do
    report = described_class.call(agency: agency, dir: dir)

    expect(report[:ok]).to be(true)
    expect(report[:diff][:leads]).to eq(current: 0, incoming: 10, delta: 10)
    expect(report[:checks]).to include(files_matched: "7 of 7", duplicates: 0, screener_encrypted: true)
    expect(report[:ignored]).to eq([])
    expect(report[:as_of]).to be_present
  end

  it "reports a missing file" do
    File.delete(File.join(dir, "appointments.csv"))

    report = described_class.call(agency: agency, dir: dir)
    expect(report[:errors].map { _1[:code] }).to include("missing_file")
    expect(report[:checks][:files_matched]).to eq("6 of 7")
  end

  it "rejects wrong headers" do
    path = File.join(dir, "leads.csv")
    File.write(path, File.read(path).sub("lead_id", "id"))

    expect(described_class.call(agency: agency, dir: dir)[:errors].map { _1[:code] }).to include("bad_headers")
  end

  it "rejects duplicate natural keys and orphan rows" do
    path = File.join(dir, "stage_history.csv")
    rows = File.readlines(path).reject(&:empty?)
    File.write(path, (rows + [ rows[1], "00000000-0000-0000-0000-000000000000,inquiry,2026-09-01T00:00:00.000Z\n" ]).join)

    report = described_class.call(agency: agency, dir: dir)
    codes = report[:errors].map { _1[:code] }
    expect(codes).to include("duplicate_key", "orphan_row")
    expect(report[:checks][:duplicates]).to eq(1)
  end

  it "rejects unparseable timestamps with the row number" do
    path = File.join(dir, "leads.csv")
    File.write(path, File.read(path).sub(/2026-09-2\dT[\d:.]+Z/, "yesterday"))

    err = described_class.call(agency: agency, dir: dir)[:errors].find { _1[:code] == "bad_value" }
    expect(err).to include(file: "leads.csv")
    expect(err[:row]).to be_a(Integer)
  end

  it "rejects a value outside a known enum" do
    path = File.join(dir, "leads.csv")
    File.write(path, File.read(path).sub(",pre_screen,", ",banana,"))

    err = described_class.call(agency: agency, dir: dir)[:errors].find { _1[:code] == "bad_value" }
    expect(err).to include(file: "leads.csv")
  end

  it "requires >=50% overlap with an agency's existing leads" do
    AlphaScenario.load!(agency)

    expect(described_class.call(agency: agency, dir: dir)[:errors].map { _1[:code] }).not_to include("agency_mismatch")
    other = AlphaScenario.copy_dir(:other_leads) # 10 completely different lead ids
    expect(described_class.call(agency: agency, dir: other)[:errors].map { _1[:code] }).to include("agency_mismatch")
  end

  it "warns on stage mismatch, unknown source and normalized aliases" do
    path = File.join(dir, "leads.csv")
    File.write(path, File.read(path).sub(",ig,", ",podcast,"))

    report = described_class.call(agency: agency, dir: dir)
    codes = report[:warnings].map { _1[:code] }
    expect(codes).to include("unknown_source", "source_aliases_normalized")
  end

  it "counts duplicate_email as extra rows, not people" do
    builder = AlphaScenario.builder
    builder.lead(id: SecureRandom.uuid, created: "2026-09-20T10:00:00Z", source: "google",
                 email: "l1.alpha@example.com", history: %w[inquiry pre_screen], stage: "pre_screen")
    shared = builder.write(Dir.mktmpdir("alpha-dup-email"))

    warning = described_class.call(agency: agency, dir: shared)[:warnings].find { _1[:code] == "duplicate_email" }
    expect(warning[:count]).to eq(1)
  end

  it "lists uploaded files that match none of the seven names as ignored" do
    FileUtils.touch(File.join(dir, "notes.txt"))

    expect(described_class.call(agency: agency, dir: dir)[:ignored]).to eq([ "notes.txt" ])
  end
end

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

  it "rejects orphan rows, one issue per file with a count and the first row" do
    path = File.join(dir, "stage_history.csv")
    rows = File.readlines(path).reject(&:empty?)
    orphan = "00000000-0000-4000-8000-000000000000"
    File.write(path, (rows + [ "#{orphan},inquiry,2026-09-01T00:00:00.000Z\n", "#{orphan},pre_screen,2026-09-02T00:00:00.000Z\n" ]).join)

    issues = described_class.call(agency: agency, dir: dir)[:errors].select { _1[:code] == "orphan_row" }
    expect(issues.size).to eq(1)
    expect(issues.first).to include(file: "stage_history.csv", row: rows.size + 1)
    expect(issues.first[:message]).to eq(
      "stage_history.csv has 2 rows whose lead_id is not in leads.csv (first at row #{rows.size + 1})"
    )
  end

  it "keeps the first of each duplicated row, counts the rest per file and does not block" do
    path = File.join(dir, "stage_history.csv")
    rows = File.readlines(path).reject(&:empty?)
    File.write(path, (rows + [ rows[1], rows[1], rows[2] ]).join)
    leads = File.join(dir, "leads.csv")
    lead_rows = File.readlines(leads).reject(&:empty?)
    File.write(leads, (lead_rows + [ lead_rows[1] ]).join)

    report = described_class.call(agency: agency, dir: dir)

    expect(report[:ok]).to be(true)
    warnings = report[:warnings].select { _1[:code] == "duplicate_rows_dropped" }
    expect(warnings.map { [ _1[:count], _1[:message] ] }).to contain_exactly(
      [ 3, "stage_history.csv has 3 duplicate rows: we will keep just one of each" ],
      [ 1, "leads.csv has 1 duplicate row: we will keep just one of each" ]
    )
    expect(report[:checks][:duplicates]).to eq(4)
    # incoming is what will be loaded: the dropped copies are not counted.
    expect(report[:diff][:leads]).to eq(current: 0, incoming: 10, delta: 10)
    expect(report[:diff][:stage_events][:incoming]).to eq(rows.size - 1)
  end

  it "reports blank required values once per file and column, with the first row" do
    path = File.join(dir, "leads.csv")
    lines = File.readlines(path)
    header = lines.first.chomp.split(",")
    stage = header.index("current_stage")
    blanked = lines.each_with_index.map do |line, index|
      next line unless index == 2 || index == 3

      cells = line.chomp.split(",", -1)
      cells[stage] = ""
      "#{cells.join(',')}\n"
    end
    File.write(path, blanked.join)

    issue = described_class.call(agency: agency, dir: dir)[:errors].find { _1[:code] == "bad_value" }
    expect(issue).to include(file: "leads.csv", row: 3)
    expect(issue[:message]).to eq("leads.csv has 2 rows with a blank current_stage (first at row 3)")
  end

  it "rejects a lead_id that is not a lowercase UUID" do
    path = File.join(dir, "leads.csv")
    lines = File.readlines(path)
    id = lines[1].split(",").first
    File.write(path, lines.join.sub(id, id.upcase))

    issue = described_class.call(agency: agency, dir: dir)[:errors].find { _1[:file] == "leads.csv" && _1[:code] == "bad_value" }
    expect(issue[:message]).to eq("leads.csv has 1 row where lead_id is not a lowercase UUID (first at row 2)")
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
    expect(warning[:message]).to eq(
      "1 extra leads share an email with another lead; they are linked as one person and kept as separate inquiries"
    )
  end

  # L1 was created 09-20 and accepted on 09-26: an inquiry on the same email created before the
  # acceptance overlaps it; one created after does not.
  def shared_email_dir(created)
    builder = AlphaScenario.builder
    builder.lead(id: SecureRandom.uuid, created: created, source: "google",
                 email: "l1.alpha@example.com", history: %w[inquiry pre_screen], stage: "pre_screen")
    builder.write(Dir.mktmpdir("alpha-overlap"))
  end

  def warning_for(dir_path, code) = described_class.call(agency: agency, dir: dir_path)[:warnings].find { _1[:code] == code }

  it "warns about a pair of inquiries from one person that were open at the same time" do
    warning = warning_for(shared_email_dir("2026-09-25T10:00:00Z"), "open_duplicate_inquiry")

    expect(warning).to eq(code: "open_duplicate_inquiry", count: 1,
                          message: "1 pairs of inquiries from the same person were open at the same time")
  end

  it "does not warn when the earlier inquiry had closed before the later one began" do
    expect(warning_for(shared_email_dir("2026-09-27T10:00:00Z"), "open_duplicate_inquiry")).to be_nil
  end

  it "lists uploaded files that match none of the seven names as ignored" do
    FileUtils.touch(File.join(dir, "notes.txt"))

    expect(described_class.call(agency: agency, dir: dir)[:ignored]).to eq([ "notes.txt" ])
  end
end

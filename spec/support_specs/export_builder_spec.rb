require "rails_helper"

RSpec.describe ExportBuilder do
  subject(:builder) do
    described_class.new.lead(
      id: "aaaaaaaa-0000-4000-8000-000000000001",
      created: "2026-09-20T10:00:00.000Z",
      source: "facebook", campaign: "c-a", coordinator: "Jess Kim", state: "CA",
      stage: "consult", outcome: "open",
      history: %w[inquiry pre_screen application consult],
      outbound_at: "2026-09-20T10:30:00.000Z",
      application: { started: "2026-09-21T10:00:00.000Z", submitted: "2026-09-22T10:00:00.000Z",
                     pct: 100, section: "review_and_sign" },
      appointment: { booked: "2026-09-22T10:00:00.000Z", at: "2026-09-23T10:00:00.000Z", status: "attended" },
      age: 34
    )
  end

  it "returns the seven row tables" do
    expect(builder.rows.keys).to match_array(%i[leads stage_events contacts screener_answers web_sessions appointments applications])
  end

  it "links every child row back to its lead by :external_id" do
    rows = builder.rows
    expect(rows[:leads].first[:external_id]).to eq("aaaaaaaa-0000-4000-8000-000000000001")
    expect(rows[:stage_events].map { _1[:external_id] }.uniq).to eq([ "aaaaaaaa-0000-4000-8000-000000000001" ])
    expect(rows[:stage_events].map { _1[:stage] }).to eq(%w[inquiry pre_screen application consult])
    expect(rows[:contacts].first).to include(direction: "outbound", channel: "text", contacted_by: "Jess Kim")
    expect(rows[:applications].first).to include(started_at: Time.iso8601("2026-09-21T10:00:00Z"),
                                                 submitted_at: Time.iso8601("2026-09-22T10:00:00Z"),
                                                 percent_complete: 100)
    expect(rows[:appointments].first).to include(status: "attended")
  end

  it "derives the Alpha identity fields from insertion order" do
    expect(builder.rows[:leads].first).to include(
      first_name: "L1", last_name: "Alpha", email: "l1.alpha@example.com", phone: "555-0183-0001"
    )
  end

  it "answers the ten screener questions, the age one with the age" do
    answers = builder.rows[:screener_answers]
    expect(answers.size).to eq(10)
    expect(answers.map { _1[:meets_requirement] }).to all(eq("yes"))
    expect(answers.find { _1[:question] == "How old are you?" }[:answer]).to eq("34")
  end

  it "writes the seven CSVs with the export headers" do
    Dir.mktmpdir do |dir|
      expect(described_class.new.write(dir)).to eq(dir)
      expect(Dir.children(dir)).to match_array(Snapshot::Constants::REQUIRED_FILES)
      Snapshot::Constants::REQUIRED_FILES.each do |file|
        headers = File.readlines(File.join(dir, file)).first.strip
        expect(headers).to eq(Snapshot::Constants::HEADERS.fetch(file).join(","))
      end
    end
  end

  it "writes one row per lead, with lead_id = external_id and blank fields empty" do
    Dir.mktmpdir do |dir|
      builder.write(dir)
      expect(File.readlines(File.join(dir, "leads.csv")).size).to eq(2)
      row = CSV.read(File.join(dir, "leads.csv"), headers: true).first
      expect(row["lead_id"]).to eq("aaaaaaaa-0000-4000-8000-000000000001")
      expect(row["created_at"]).to eq("2026-09-20T10:00:00.000Z")
      expect(row["source"]).to eq("facebook")
      expect(row["paused_until"]).to be_nil
      expect(File.readlines(File.join(dir, "stage_history.csv")).size).to eq(5)
    end
  end
end

require "rails_helper"
require "pg"

RSpec.describe Snapshot::Importer do
  let(:agency) do
    create(:agency, slug: "alpha", timezone: "America/Los_Angeles", qualified_milestone: "consult_attended")
  end
  let(:dir) { AlphaScenario.copy_dir }

  before { Current.agency = agency }

  def counts(for_agency = agency)
    %w[leads stage_events contacts screener_answers web_sessions appointments applications lead_facts]
      .index_with { |table| raw_count(table, for_agency) }
  end

  def raw_count(table, for_agency)
    ActiveRecord::Base.connection.select_value(
      "select count(*) from #{table} where agency_id = '#{for_agency.id}'"
    ).to_i
  end

  it "loads Alpha with normalized channels and an as_of" do
    snapshot = described_class.call(agency: agency, dir: dir)

    expect(counts["leads"]).to eq(10)
    expect(Lead.group(:channel).count).to include(
      "Facebook" => 3, "Instagram" => 1, "Google" => 3, "Referral" => 1, "TikTok" => 1, "Unknown" => 1
    )
    expect(Lead.find_by(source_raw: nil).channel).to eq("Unknown")
    expect(snapshot.as_of).to eq(AlphaScenario::AS_OF)
    expect(snapshot.row_counts["screener_answers"]).to eq(100)
    expect(snapshot.row_counts["applications"]).to eq(5)
  end

  it "computes lead_facts" do
    described_class.call(agency: agency, dir: dir)

    fact = Lead.find_by!(first_name: "L1").lead_fact
    expect(fact.consult_attended_at).to be_present
    expect(fact.application_submitted_at).to be_present
    expect(fact.accepted_at).to be_present
    expect(fact.furthest_stage).to eq("accepted")
    expect(fact.first_response_minutes).to eq(30)
    expect(Lead.find_by!(first_name: "L7").lead_fact.first_outbound_at).to be_nil
    expect(Lead.find_by!(first_name: "L3").lead_fact.consult_attended_at).to be_nil # no_show
  end

  it "is idempotent: loading the same snapshot twice keeps the same counts" do
    described_class.call(agency: agency, dir: dir)
    first = counts
    described_class.call(agency: agency, dir: dir)

    expect(counts).to eq(first)
    expect(Snapshot.where(agency_id: agency.id).count).to eq(2)
  end

  it "replaces with a newer snapshot (v2 adds 2 leads, moves L4)" do
    described_class.call(agency: agency, dir: dir)
    described_class.call(agency: agency, dir: AlphaScenario.copy_dir(:v2))

    expect(counts["leads"]).to eq(12)
    expect(Lead.find_by!(first_name: "L4").current_stage).to eq("consult")
  end

  it "rolls back completely when a later table fails" do
    described_class.call(agency: agency, dir: dir)
    bad = AlphaScenario.copy_dir(:v2)
    File.write(File.join(bad, "applications.csv"), File.read(File.join(bad, "applications.csv")).sub(/,100,/, ",not-a-number,"))

    expect { described_class.call(agency: agency, dir: bad) }.to raise_error(Snapshot::Importer::Invalid)
    expect(counts["leads"]).to eq(10)
  end

  it "loads only the first of each duplicated row, matching what the report counted" do
    path = File.join(dir, "stage_history.csv")
    rows = File.readlines(path).reject(&:empty?)
    File.write(path, (rows + [ rows[1], rows[1] ]).join)
    leads = File.join(dir, "leads.csv")
    lead_rows = File.readlines(leads).reject(&:empty?)
    File.write(leads, (lead_rows + [ lead_rows[1] ]).join)

    snapshot = described_class.call(agency: agency, dir: dir)

    expect(counts["leads"]).to eq(10)
    expect(counts["stage_events"]).to eq(rows.size - 1)
    expect(snapshot.row_counts["stage_events"]).to eq(rows.size - 1)
    expect(snapshot.warnings.map { _1["code"] }).to include("duplicate_rows_dropped")
  end

  it "keeps another agency's data untouched" do
    other = create(:agency)
    described_class.call(agency: other, dir: AlphaScenario.copy_dir(:other_leads))
    described_class.call(agency: agency, dir: dir)

    expect(raw_count("leads", other)).to eq(10)
    expect(raw_count("leads", agency)).to eq(10)
  end

  # Same data, many agencies (spec 2002 decision 12, lane override 3): the identical export is
  # fine for a second agency, with equal counts and nothing said about the other agency.
  it "loads the same files into two agencies as independent, equal copies" do
    other = create(:agency, slug: "beta")
    first = described_class.call(agency: agency, dir: dir)
    second = described_class.call(agency: other, dir: dir)

    expect(second.row_counts).to eq(first.row_counts)
    expect(counts(agency)).to eq(counts(other))
    expect(Lead.unscoped.where(agency_id: other.id).pluck(:external_id))
      .to match_array(Lead.unscoped.where(agency_id: agency.id).pluck(:external_id))
  end

  it "aborts with Cancelled when the upload was cancelled mid-import" do
    expect { described_class.call(agency: agency, dir: dir, cancel: -> { true }) }
      .to raise_error(Snapshot::Importer::Cancelled)
    expect(counts["leads"]).to eq(0)
  end

  it "raises InProgress when another session holds the advisory lock" do
    key = described_class.lock_key(agency)
    other = raw_connection
    other.exec("SELECT pg_advisory_lock(#{key})")

    expect { described_class.call(agency: agency, dir: dir) }.to raise_error(Snapshot::Importer::InProgress)
  ensure
    if other
      other.exec("SELECT pg_advisory_unlock(#{key})")
      other.close
    end
  end

  # Planner statistics: after a load every table is ANALYZEd so the NEXT replace's cascaded FK
  # triggers get index plans instead of seq-scanning a bulk-loaded table (autovacuum may not have
  # run yet). pg_stat_user_tables.last_analyze is only published at commit, and these specs run
  # inside a transaction that is rolled back, so the immediately-visible pg_class.reltuples is
  # asserted instead.
  describe "planner statistics" do
    def reltuples(table)
      ActiveRecord::Base.connection.select_value(
        "SELECT reltuples FROM pg_class WHERE relname = #{ActiveRecord::Base.connection.quote(table)}"
      ).to_i
    end

    it "analyzes every loaded table after the rows are in" do
      analyzed = []
      allow(described_class).to receive(:analyze).and_wrap_original do |original, table|
        analyzed << table
        original.call(table)
      end

      described_class.call(agency: agency, dir: dir)

      expect(analyzed).to include(*Snapshot::Importer::ANALYZE_TABLES)
      expect(reltuples("leads")).to eq(10)
      expect(reltuples("screener_answers")).to eq(100)
      expect(reltuples("lead_facts")).to eq(10)
    end

    it "analyzes never-analyzed tables before replacing the old snapshot" do
      allow(described_class).to receive(:analyzed?).and_return(false)
      allow(described_class).to receive(:analyze).and_call_original
      expect(described_class).to receive(:analyze_unanalyzed_tables).and_call_original

      described_class.call(agency: agency, dir: dir)

      expect(described_class).to have_received(:analyze).with("leads").at_least(:once)
    end

    it "leaves tables that already have statistics alone before replacing" do
      allow(described_class).to receive(:analyzed?).and_return(true)
      expect(described_class).not_to receive(:analyze)

      described_class.analyze_unanalyzed_tables
    end
  end

  # A long, write-free phase (Facts.call) must not look like a dead job to ExpireUploadsJob.
  it "heartbeats the upload around the quiet computing phase" do
    progress = double("progress", update: nil, heartbeat: nil)

    described_class.call(agency: agency, dir: dir, progress: progress)

    expect(progress).to have_received(:heartbeat).at_least(:once)
  end

  def raw_connection
    config = ActiveRecord::Base.connection_db_config.configuration_hash
    PG.connect(host: config[:host], port: config[:port], dbname: config[:database],
               user: config[:username], password: config[:password])
  end
end

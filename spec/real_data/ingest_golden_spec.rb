require "rails_helper"
require_relative "golden_helper"
require "csv"

# Real exports only (docs/conventions/real-data.md): auto-skipped when they are absent, never in
# CI. Drives the real upload → validate → commit job path (not RealData.load!) and compares the
# result with the independent oracle spec/real_data/golden.json.
RSpec.describe "Snapshot ingest golden numbers", :real_data, type: :request do
  include ActiveJob::TestHelper

  HEADERS = { "X-Requested-With" => "simbe" }.freeze
  LAKESIDE_BUDGET_SECONDS = 120

  def files_for(slug)
    dir = RealData.dir(slug)
    Snapshot::Constants::REQUIRED_FILES.map do |name|
      Rack::Test::UploadedFile.new(File.join(dir, name), "text/csv")
    end
  end

  def sign_in(owner)
    post "/api/v1/session", params: { email: owner.email, password: "secret-pass-1" }, headers: HEADERS, as: :json
    expect(response).to have_http_status(:created)
  end

  def create_agency_with_owner(slug, agency_slug: slug)
    config = RealData::CONFIG.fetch(slug)
    agency = create(:agency, slug: agency_slug, name: slug.capitalize,
                             timezone: config[:timezone], qualified_milestone: config[:qualified_milestone])
    owner = create(:user, agency: agency, email: "owner-#{agency_slug}@golden.test", password: "secret-pass-1")
    [ agency, owner ]
  end

  # Uploads + validates + commits through the API, draining the ingest jobs inline.
  # -> [upload_body, validate_seconds, import_seconds]
  def upload_and_commit(owner, slug)
    sign_in(owner)
    id = nil
    validate_seconds = seconds do
      perform_enqueued_jobs do
        post "/api/v1/snapshot_uploads", params: { files: files_for(slug) }, headers: HEADERS
      end
      expect(response).to have_http_status(:created)
      id = response.parsed_body["id"]
    end

    get "/api/v1/snapshot_uploads/#{id}", headers: HEADERS
    expect(response.parsed_body["status"]).to eq("validated")
    expect(response.parsed_body.dig("report", "ok")).to be(true)

    import_seconds = seconds do
      perform_enqueued_jobs { post "/api/v1/snapshot_uploads/#{id}/commit", headers: HEADERS }
      expect(response).to have_http_status(:accepted)
    end

    get "/api/v1/snapshot_uploads/#{id}", headers: HEADERS
    expect(response.parsed_body["status"]).to eq("committed")
    [ response.parsed_body, validate_seconds, import_seconds ]
  end

  def seconds
    started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    yield
    Process.clock_gettime(Process::CLOCK_MONOTONIC) - started
  end

  def fact_counts(agency)
    facts = LeadFact.unscoped.where(agency_id: agency.id)
    {
      "application_submitted" => facts.where.not(application_submitted_at: nil).count,
      "consult_attended" => facts.where.not(consult_attended_at: nil).count,
      "records" => facts.where.not(records_at: nil).count,
      "accepted" => facts.where.not(accepted_at: nil).count,
      "first_outbound_missing" => facts.where(first_outbound_at: nil).count
    }
  end

  # Independent mini-oracle for the one aggregate golden.json does not carry: leads with no
  # outbound contact that has a timestamp (stdlib CSV, no app code).
  def csv_leads_without_outbound(slug)
    dir = RealData.dir(slug)
    outbound = {}
    CSV.foreach(File.join(dir, "contact_log.csv"), headers: true, encoding: "bom|utf-8") do |row|
      next unless row["direction"] == "outbound" && !row["contacted_at"].to_s.strip.empty?

      outbound[row["lead_id"]] = true
    end
    count = 0
    CSV.foreach(File.join(dir, "leads.csv"), headers: true, encoding: "bom|utf-8") do |row|
      count += 1 unless outbound[row["lead_id"]]
    end
    count
  end

  def as_of_seconds(value)
    Time.iso8601(value).utc.change(usec: 0).strftime("%Y-%m-%dT%H:%M:%S.000Z")
  end

  def warning_count(body, code)
    body.dig("report", "warnings").find { |warning| warning["code"] == code }&.fetch("count", 0) || 0
  end

  RealData::CONFIG.each_key do |slug|
    it "loads #{slug} through the upload API and matches golden (twice, identical)" do
      golden = Golden.agency(slug)
      agency, owner = create_agency_with_owner(slug)

      body, validate_seconds, import_seconds = upload_and_commit(owner, slug)
      puts "#{slug}: validate=#{validate_seconds.round(1)}s import=#{import_seconds.round(1)}s"
      expect(import_seconds).to be < LAKESIDE_BUDGET_SECONDS if slug == "lakeside"

      snapshot = body["snapshot"]
      expect(snapshot["row_counts"]).to eq(golden["row_counts"])
      expect(as_of_seconds(snapshot["as_of"])).to eq(golden["as_of"])
      expect(warning_count(body, "duplicate_email")).to eq(golden.dig("warnings", "duplicate_email_extra_rows"))
      expect(warning_count(body, "source_aliases_normalized")).to eq(golden.dig("warnings", "source_aliases_normalized"))
      expect(warning_count(body, "stage_mismatch")).to eq(golden.dig("warnings", "stage_mismatch"))

      counts = fact_counts(agency)
      expect(counts.except("first_outbound_missing")).to eq(golden["qualified_all_time"])
      expect(counts["first_outbound_missing"]).to eq(csv_leads_without_outbound(slug))

      # Re-loading the same files leaves identical counts (no double counting).
      repeat, = upload_and_commit(owner, slug)
      expect(repeat["snapshot"]["row_counts"]).to eq(snapshot["row_counts"])
      expect(fact_counts(agency)).to eq(counts)
    end
  end

  it "loads Harbor into a second agency without touching the first" do
    first, first_owner = create_agency_with_owner("harbor")
    first_body, = upload_and_commit(first_owner, "harbor")
    first_facts = fact_counts(first)

    second, second_owner = create_agency_with_owner("harbor", agency_slug: "harbor-two")
    second_body, = upload_and_commit(second_owner, "harbor")

    expect(second_body["snapshot"]["row_counts"]).to eq(Golden.agency("harbor")["row_counts"])
    expect(fact_counts(second)).to eq(first_facts)
    expect(Lead.unscoped.where(agency_id: first.id).count).to eq(first_body["snapshot"]["row_counts"]["leads"])
  end
end

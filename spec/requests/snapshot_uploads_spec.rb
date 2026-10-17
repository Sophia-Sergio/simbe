require "rails_helper"

RSpec.describe "Snapshot uploads", type: :request do
  include ActiveJob::TestHelper

  let(:headers) { { "X-Requested-With" => "simbe" } }
  let(:agency) { create(:agency, slug: "alpha", qualified_milestone: "consult_attended") }
  let!(:owner) { create(:user, agency: agency, password: "secret-pass-1") }

  def sign_in(user)
    post "/api/v1/session", params: { email: user.email, password: "secret-pass-1" }, headers: headers, as: :json
    expect(response).to have_http_status(:created)
  end

  def files(dir = AlphaScenario.copy_dir)
    Dir[File.join(dir, "*.csv")].sort.map { |path| Rack::Test::UploadedFile.new(path, "text/csv") }
  end

  # POST with the `ingest` jobs drained inline (queue adapter :test + perform_enqueued_jobs).
  def create_upload(upload_files = files)
    perform_enqueued_jobs do
      post "/api/v1/snapshot_uploads", params: { files: upload_files }, headers: headers
    end
    response.parsed_body["id"]
  end

  def commit!(id)
    perform_enqueued_jobs { post "/api/v1/snapshot_uploads/#{id}/commit", headers: headers }
  end

  it "stores the files and returns validating / storing (201)" do
    sign_in(owner)

    id = create_upload

    expect(response).to have_http_status(:created)
    expect(response.parsed_body).to include("id" => id, "status" => "validating", "report" => nil, "snapshot" => nil,
                                            "error" => nil)
    expect(response.parsed_body["progress"]).to eq("phase" => "storing", "pct" => 0)
    expect(Dir.children(Snapshot::Storage.dir(agency.snapshot_uploads.find(id)))).to match_array(
      Snapshot::Constants::REQUIRED_FILES
    )
  end

  it "uploads, validates and commits, then exposes the snapshot" do
    sign_in(owner)
    id = create_upload

    get "/api/v1/snapshot_uploads/#{id}", headers: headers
    expect(response).to have_http_status(:ok)
    expect(response.parsed_body["status"]).to eq("validated")
    expect(response.parsed_body.dig("report", "ok")).to be(true)
    expect(response.parsed_body.dig("report", "checks", "files_matched")).to eq("7 of 7")

    commit!(id)
    expect(response).to have_http_status(:accepted)
    expect(response.parsed_body["status"]).to eq("committing")

    get "/api/v1/snapshot_uploads/#{id}", headers: headers
    expect(response.parsed_body["status"]).to eq("committed")
    expect(response.parsed_body.dig("snapshot", "row_counts", "leads")).to eq(10)

    get "/api/v1/snapshots/current", headers: headers
    expect(response).to have_http_status(:ok)
    expect(response.parsed_body.dig("snapshot", "row_counts", "leads")).to eq(10)
    expect(response.parsed_body.dig("snapshot", "as_of")).to eq(AlphaScenario::AS_OF.iso8601(3))
    expect(response.parsed_body["pending"]).to be_nil
    expect(response.parsed_body["files"]).to include({ "name" => "leads.csv", "rows" => 10 })
    expect(Dir.exist?(Snapshot::Storage.dir(agency.snapshot_uploads.find(id)))).to be(false)
  end

  it "refuses to commit an invalid upload with the report (422)" do
    sign_in(owner)
    id = create_upload(files.first(3)) # missing four files

    commit!(id)

    expect(response).to have_http_status(422)
    expect(response.parsed_body.dig("error", "code")).to eq("invalid_snapshot")
    expect(response.parsed_body.dig("report", "errors").map { _1["code"] }).to include("missing_file")
    expect(Snapshot.for_agency(agency)).to be_empty
  end

  it "answers 409 not_validated before validation finishes" do
    sign_in(owner)
    post "/api/v1/snapshot_uploads", params: { files: files }, headers: headers # job queued, not run
    id = response.parsed_body["id"]

    post "/api/v1/snapshot_uploads/#{id}/commit", headers: headers
    expect(response).to have_http_status(:conflict)
    expect(response.parsed_body.dig("error", "code")).to eq("not_validated")
  end

  it "answers 409 already_in_progress when another upload is in flight" do
    sign_in(owner)
    id = create_upload
    SnapshotUpload.create!(agency: agency, user: owner, status: "validating")

    post "/api/v1/snapshot_uploads/#{id}/commit", headers: headers
    expect(response).to have_http_status(:conflict)
    expect(response.parsed_body.dig("error", "code")).to eq("already_in_progress")
  end

  it "cancels an upload and removes its files" do
    sign_in(owner)
    id = create_upload

    delete "/api/v1/snapshot_uploads/#{id}", headers: headers
    expect(response).to have_http_status(:no_content)

    get "/api/v1/snapshot_uploads/#{id}", headers: headers
    expect(response.parsed_body["status"]).to eq("cancelled")
    expect(Dir.exist?(Snapshot::Storage.dir(agency.snapshot_uploads.find(id)))).to be(false)
  end

  it "cancels a failed upload" do
    sign_in(owner)
    upload = SnapshotUpload.create!(agency: agency, user: owner, status: "failed")

    delete "/api/v1/snapshot_uploads/#{upload.id}", headers: headers

    expect(response).to have_http_status(:no_content)
    expect(upload.reload.status).to eq("cancelled")
  end

  it "does not cancel a committed upload" do
    sign_in(owner)
    snapshot = Snapshot.create!(agency: agency, as_of: Time.current, loaded_at: Time.current,
                                row_counts: {}, warnings: [])
    upload = SnapshotUpload.create!(agency: agency, user: owner, status: "committed", snapshot: snapshot)

    delete "/api/v1/snapshot_uploads/#{upload.id}", headers: headers

    expect(response).to have_http_status(:no_content)
    expect(upload.reload.status).to eq("committed")
  end

  it "shows a pending upload on the current snapshot" do    sign_in(owner)
    post "/api/v1/snapshot_uploads", params: { files: files }, headers: headers
    id = response.parsed_body["id"]

    get "/api/v1/snapshots/current", headers: headers
    expect(response.parsed_body["snapshot"]).to be_nil
    expect(response.parsed_body["pending"]).to include("upload_id" => id, "status" => "validating")
    expect(response.parsed_body["pending"]["progress"]).to eq("phase" => "storing", "pct" => 0)
  end

  it "stores only the seven export files and reports the rest as ignored" do
    sign_in(owner)
    Dir.mktmpdir("upload-extra") do |dir|
      extra = File.join(dir, "notes.txt")
      File.write(extra, "hello")

      id = create_upload(files + [ Rack::Test::UploadedFile.new(extra, "text/plain") ])

      get "/api/v1/snapshot_uploads/#{id}", headers: headers
      expect(response.parsed_body.dig("report", "ignored")).to eq([ "notes.txt" ])
      stored = Dir.children(Snapshot::Storage.dir(agency.snapshot_uploads.find(id)))
      expect(stored).to match_array(Snapshot::Constants::REQUIRED_FILES)
    end
  end

  it "caps uploads at 250 MB (413)" do
    sign_in(owner)
    stub_const("Api::V1::SnapshotUploadsController::MAX_UPLOAD_BYTES", 1)

    post "/api/v1/snapshot_uploads", params: { files: files }, headers: headers
    expect(response).to have_http_status(413)
    expect(response.parsed_body.dig("error", "code")).to eq("too_large")
  end

  it "forbids coordinators from uploading (403)" do
    coordinator = create(:user, :coordinator, agency: agency, password: "secret-pass-1")
    sign_in(coordinator)

    post "/api/v1/snapshot_uploads", params: { files: files }, headers: headers
    expect(response).to have_http_status(:forbidden)
  end

  it "lets a coordinator read the current snapshot" do
    coordinator = create(:user, :coordinator, agency: agency, password: "secret-pass-1")
    sign_in(coordinator)

    get "/api/v1/snapshots/current", headers: headers
    expect(response).to have_http_status(:ok)
    expect(response.parsed_body).to include("snapshot" => nil, "pending" => nil, "files" => [])
  end

  it "answers 404 for another agency's upload id" do
    other = create(:user, password: "secret-pass-1")
    sign_in(other)
    foreign_id = create_upload(files(AlphaScenario.copy_dir(:other_leads)))

    sign_in(owner)
    get "/api/v1/snapshot_uploads/#{foreign_id}", headers: headers
    expect(response).to have_http_status(:not_found)

    post "/api/v1/snapshot_uploads/#{foreign_id}/commit", headers: headers
    expect(response).to have_http_status(:not_found)

    delete "/api/v1/snapshot_uploads/#{foreign_id}", headers: headers
    expect(response).to have_http_status(:not_found)
  end

  it "claims a commit atomically: the second POST is 409 and enqueues nothing" do
    sign_in(owner)
    id = create_upload

    expect { post "/api/v1/snapshot_uploads/#{id}/commit", headers: headers }
      .to have_enqueued_job(Snapshot::CommitUploadJob).exactly(:once)
    expect(response).to have_http_status(:accepted)

    expect { post "/api/v1/snapshot_uploads/#{id}/commit", headers: headers }
      .not_to have_enqueued_job(Snapshot::CommitUploadJob)
    expect(response).to have_http_status(:conflict)
    expect(response.parsed_body.dig("error", "code")).to eq("already_in_progress")
    expect(SnapshotUpload.find(id).status).to eq("committing") # never failed
  end

  # --- create is robust: a failed store must not leave the agency blocked -------------------
  # The contract does not declare 422/500 for create (see the lane summary's CCR list), so these
  # two examples ignore unknown response statuses; conformance stays on for every declared status.
  context "with a failure status the contract does not declare" do
    around do |example|
      configuration = OpenapiFirst::Test.configuration
      previous = configuration.ignore_unknown_response_status?
      configuration.ignore_unknown_response_status = true
      example.run
    ensure
      configuration.ignore_unknown_response_status = previous
    end

    def uploaded_with_name(path, original_filename)
      file = Rack::Test::UploadedFile.new(path, "text/csv")
      allow(file).to receive(:original_filename).and_return(original_filename)
      file
    end

    it "rejects a filename with control characters (422) before creating a row" do
      sign_in(owner)
      dir = AlphaScenario.copy_dir

      post "/api/v1/snapshot_uploads",
           params: { files: [ uploaded_with_name(File.join(dir, "leads.csv"), "leads\u0000.csv") ] },
           headers: headers

      expect(response).to have_http_status(422)
      expect(response.parsed_body.dig("error", "code")).to eq("invalid_request")
      expect(agency.snapshot_uploads).to be_empty
    end

    it "marks the upload failed and frees the agency when storing breaks" do
      sign_in(owner)
      allow(Snapshot::Storage).to receive(:store).and_raise(Errno::ENOSPC)

      post "/api/v1/snapshot_uploads", params: { files: files }, headers: headers
      expect(response).to have_http_status(500)
      expect(response.parsed_body.dig("error", "code")).to eq("upload_failed")

      failed = agency.snapshot_uploads.find_by(status: "failed")
      expect(failed).to be_present
      expect(agency.snapshot_uploads.in_flight).to be_empty
      expect(Dir.exist?(Snapshot::Storage.dir(failed))).to be(false)

      # the agency is no longer blocked: a new upload works
      allow(Snapshot::Storage).to receive(:store).and_call_original
      expect(create_upload(files)).to be_present
    end

    it "rejects two files that resolve to the same export name (422)" do
      sign_in(owner)
      dir = AlphaScenario.copy_dir

      post "/api/v1/snapshot_uploads",
           params: { files: [ uploaded_with_name(File.join(dir, "leads.csv"), "leads.csv"),
                              uploaded_with_name(File.join(dir, "leads.csv"), "LEADS.CSV") ] },
           headers: headers

      expect(response).to have_http_status(422)
      expect(response.parsed_body.dig("error", "code")).to eq("invalid_request")
      expect(agency.snapshot_uploads).to be_empty
    end

    it "rejects a matched file whose content type is not CSV-like (422)" do
      sign_in(owner)
      dir = AlphaScenario.copy_dir

      post "/api/v1/snapshot_uploads",
           params: { files: [ Rack::Test::UploadedFile.new(File.join(dir, "leads.csv"), "application/pdf") ] },
           headers: headers

      expect(response).to have_http_status(422)
      expect(agency.snapshot_uploads).to be_empty
    end

    it "caps the number of uploaded files (422)" do
      sign_in(owner)
      dir = AlphaScenario.copy_dir
      many = Array.new(Snapshot::Storage::MAX_FILES + 1) do
        Rack::Test::UploadedFile.new(File.join(dir, "leads.csv"), "text/csv")
      end

      post "/api/v1/snapshot_uploads", params: { files: many }, headers: headers

      expect(response).to have_http_status(422)
      expect(agency.snapshot_uploads).to be_empty
    end
  end
end

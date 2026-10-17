require "rails_helper"

RSpec.describe Snapshot::CommitUploadJob do
  let(:agency) { create(:agency, slug: "alpha", qualified_milestone: "consult_attended") }
  let(:user) { create(:user, agency: agency) }

  def upload_for(status: "committing")
    dir = AlphaScenario.copy_dir
    report = Snapshot::Validator.call(agency: agency, dir: dir)
    SnapshotUpload.create!(agency: agency, user: user, status: status, dir: dir, report: report)
  end

  it "imports the snapshot and marks the upload committed" do
    upload = upload_for

    described_class.perform_now(upload)

    upload.reload
    expect(upload.status).to eq("committed")
    expect(upload.progress).to be_nil
    expect(upload.snapshot).to be_present
    expect(upload.snapshot.row_counts["leads"]).to eq(10)
  end

  it "marks the upload failed with a readable error and keeps the previous snapshot" do
    AlphaScenario.load!(agency)
    upload = upload_for
    allow(Snapshot::Importer).to receive(:call).and_raise(StandardError, "boom")

    described_class.perform_now(upload)

    upload.reload
    expect(upload.status).to eq("failed")
    expect(upload.error["code"]).to eq("import_failed")
    expect(upload.error["message"]).not_to include("boom")
    expect(Snapshot.for_agency(agency).count).to eq(1)
    expect(Current.agency).to be_nil
  end

  it "reports a concurrent load as already_in_progress" do
    upload = upload_for
    allow(Snapshot::Importer).to receive(:call).and_raise(Snapshot::Importer::InProgress)

    described_class.perform_now(upload)

    expect(upload.reload.error["code"]).to eq("already_in_progress")
    expect(upload.status).to eq("failed")
  end

  it "does nothing for an upload that is no longer committing" do
    upload = upload_for(status: "cancelled")

    described_class.perform_now(upload)

    expect(upload.reload.status).to eq("cancelled")
  end
end

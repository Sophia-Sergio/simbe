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

  it "does not touch the upload's status when it loses the advisory lock" do
    upload = upload_for
    allow(Snapshot::Importer).to receive(:call).and_raise(Snapshot::Importer::InProgress)

    described_class.perform_now(upload)

    upload.reload
    expect(upload.status).to eq("committing") # another job for this agency owns it
    expect(upload.error).to be_nil
  end

  it "does nothing for an upload that is no longer committing" do
    upload = upload_for(status: "cancelled")

    described_class.perform_now(upload)

    expect(upload.reload.status).to eq("cancelled")
  end

  it "leaves a cancellation that lands mid-import alone" do
    upload = upload_for
    allow(Snapshot::Importer).to receive(:call) do
      SnapshotUpload.where(id: upload.id).update_all(status: "cancelled")
      raise Snapshot::Importer::Cancelled
    end

    described_class.perform_now(upload)

    expect(upload.reload.status).to eq("cancelled")
  end

  it "does not overwrite a cancellation with failed on a late error" do
    upload = upload_for
    allow(Snapshot::Importer).to receive(:call) do
      SnapshotUpload.where(id: upload.id).update_all(status: "cancelled")
      raise StandardError, "boom"
    end

    described_class.perform_now(upload)

    expect(upload.reload.status).to eq("cancelled")
  end

  it "does not mark committed when the upload is cancelled after the import" do
    snapshot = Snapshot.create!(agency: agency, as_of: Time.current, loaded_at: Time.current,
                                row_counts: {}, warnings: [])
    upload = upload_for
    allow(Snapshot::Importer).to receive(:call) do
      SnapshotUpload.where(id: upload.id).update_all(status: "cancelled")
      snapshot
    end

    described_class.perform_now(upload)

    expect(upload.reload.status).to eq("cancelled")
  end
end

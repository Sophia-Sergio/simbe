require "rails_helper"

RSpec.describe Snapshot::ValidateUploadJob do
  let(:user) { create(:user) }

  def upload_for(status: "validating", dir: AlphaScenario.copy_dir)
    SnapshotUpload.create!(agency: user.agency, user: user, status: status, dir: dir)
  end

  it "validates the upload and stores the report" do
    upload = upload_for

    described_class.perform_now(upload)

    upload.reload
    expect(upload.status).to eq("validated")
    expect(upload.report["ok"]).to be(true)
    expect(upload.progress).to be_nil
    expect(upload.finished_at).to be_present
  end

  it "records a readable error when parsing fails, never the exception" do
    upload = upload_for
    allow(Snapshot::Reader).to receive(:call).and_raise(StandardError, "secret row contents")

    described_class.perform_now(upload)

    upload.reload
    expect(upload.status).to eq("failed")
    expect(upload.error["code"]).to eq("validation_failed")
    expect(upload.error["message"]).not_to include("secret")
  end

  it "does nothing for an upload that is no longer validating" do
    upload = upload_for(status: "cancelled")

    described_class.perform_now(upload)

    expect(upload.reload.status).to eq("cancelled")
  end

  it "leaves a cancellation that lands mid-validation alone" do
    upload = upload_for
    allow(Snapshot::Reader).to receive(:call).and_wrap_original do |original, *args|
      SnapshotUpload.where(id: upload.id).update_all(status: "cancelled")
      original.call(*args)
    end

    described_class.perform_now(upload)

    expect(upload.reload.status).to eq("cancelled")
  end

  it "does not overwrite a cancellation with failed when parsing then raises" do
    upload = upload_for
    allow(Snapshot::Reader).to receive(:call) do
      SnapshotUpload.where(id: upload.id).update_all(status: "cancelled")
      raise StandardError, "boom"
    end

    described_class.perform_now(upload)

    expect(upload.reload.status).to eq("cancelled")
  end
end

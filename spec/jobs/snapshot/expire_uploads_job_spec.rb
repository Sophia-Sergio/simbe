require "rails_helper"

RSpec.describe Snapshot::ExpireUploadsJob do
  let(:user) { create(:user) }
  let(:agency) { user.agency }

  def upload_for(status:, age: nil)
    upload = SnapshotUpload.create!(agency: agency, user: user, status: status)
    upload.update_column(:created_at, age) if age
    upload
  end

  it "fails an upload stuck in flight (a worker restart frees the agency's slot)" do
    upload = upload_for(status: "committing")
    upload.update_column(:updated_at, 40.minutes.ago)

    described_class.perform_now

    upload.reload
    expect(upload.status).to eq("failed")
    expect(upload.error["code"]).to eq("interrupted")
    expect(SnapshotUpload.for_agency(agency).in_flight).to be_empty
  end

  it "leaves a fresh in-flight upload alone" do
    upload = upload_for(status: "validating")

    described_class.perform_now

    expect(upload.reload.status).to eq("validating")
  end

  it "expires uploads older than 24h and removes their files" do
    upload = upload_for(status: "validated", age: 25.hours.ago)
    FileUtils.mkdir_p(Snapshot::Storage.dir(upload))
    FileUtils.touch(Snapshot::Storage.path(upload, "leads.csv"))

    described_class.perform_now

    expect(upload.reload.status).to eq("expired")
    expect(File.exist?(Snapshot::Storage.dir(upload))).to be(false)
  end

  it "keeps a committed upload and its snapshot" do
    snapshot = Snapshot.create!(agency: agency, as_of: Time.current, loaded_at: Time.current, row_counts: {}, warnings: [])
    upload = upload_for(status: "committed")
    upload.update!(snapshot: snapshot)
    upload.update_column(:created_at, 25.hours.ago)

    described_class.perform_now

    expect(upload.reload.status).to eq("committed")
  end
end

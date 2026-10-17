require "rails_helper"

# Proves the ingest jobs run under the real Solid Queue setup Puma's supervisor uses
# (`SOLID_QUEUE_IN_PUMA`, config/queue.yml with a single-threaded `ingest` queue), not just the
# test adapter the other specs use.
RSpec.describe "Snapshot jobs on Solid Queue" do
  let(:user) { create(:user) }

  around do |example|
    previous = ActiveJob::Base.queue_adapter
    ActiveJob::Base.queue_adapter = :solid_queue
    example.run
  ensure
    ActiveJob::Base.queue_adapter = previous
  end

  it "gives the ingest queue a single worker thread" do
    config = YAML.load_file(Rails.root.join("config/queue.yml"), aliases: true)
    ingest = config.fetch("test").fetch("workers").find { |worker| worker["queues"] == [ "ingest" ] }

    expect(ingest).to include("threads" => 1)
  end

  it "enqueues the validation job on the ingest queue and runs it" do
    upload = SnapshotUpload.create!(agency: user.agency, user: user, status: "validating",
                                   dir: AlphaScenario.copy_dir)

    Snapshot::ValidateUploadJob.perform_later(upload)

    job = SolidQueue::Job.last
    expect(job.class_name).to eq("Snapshot::ValidateUploadJob")
    expect(job.queue_name).to eq("ingest")

    ActiveJob::Base.execute(job.arguments)
    expect(upload.reload.status).to eq("validated")
  end
end

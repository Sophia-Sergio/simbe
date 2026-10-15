require "rails_helper"

class SolidQueueBootProbeJob < ApplicationJob
  queue_as :ingest

  def perform = nil
end

RSpec.describe "Solid Queue boot" do
  it "enqueues a trivial job on the ingest queue" do
    ActiveJob::Base.queue_adapter = :test
    expect { SolidQueueBootProbeJob.perform_later }.to have_enqueued_job(SolidQueueBootProbeJob).on_queue("ingest")
  end
end

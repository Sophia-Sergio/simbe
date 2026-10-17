class Snapshot::ExpireUploadsJob < ApplicationJob
  queue_as :default

  # Maintenance (lane override 1): a worker restart mid-import leaves a row stuck in an in-flight
  # status — and the partial unique index then blocks every new upload for that agency — so rows
  # stuck longer than STALE_AFTER are failed, and uploads older than TTL are expired and their
  # files deleted. Intended to run hourly (see lib/tasks/snapshot.rake); registering it in
  # config/recurring.yml is outside this lane.
  STALE_AFTER = 30.minutes
  TTL = 24.hours

  def perform
    now = Time.current
    fail_stale(now)
    expire(now)
  end

  private

  def fail_stale(now)
    SnapshotUpload.in_flight.where("updated_at < ?", now - STALE_AFTER).find_each do |upload|
      upload.update!(status: "failed", progress: nil, finished_at: now,
                     error: { "code" => "interrupted", "message" => "The load was interrupted and did not finish" })
    end
  end

  def expire(now)
    SnapshotUpload.where(status: %w[validated failed cancelled])
                  .where("created_at < ?", now - TTL).find_each do |upload|
      upload.update!(status: "expired", progress: nil, finished_at: now)
      Snapshot::Storage.remove(upload)
    end
  end
end

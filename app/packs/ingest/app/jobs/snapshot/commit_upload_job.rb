class Snapshot::CommitUploadJob < ApplicationJob
  queue_as :ingest

  # Re-reads the stored files and replaces the agency's data in one transaction (lane override 1).
  # A failure rolls everything back, leaves the previous snapshot intact and marks the upload
  # failed with a readable error. The cancel action flips the status; the importer notices between
  # batches and aborts.
  def perform(upload)
    return unless upload.status == "committing"

    previous = Current.agency
    Current.agency = upload.agency
    progress = Snapshot::Progress.new(upload, connection: progress_connection)
    progress.update(phase: "importing", pct: 0)

    snapshot = Snapshot::Importer.call(
      agency: upload.agency, dir: upload.dir, user: upload.user, report: upload.report,
      progress: progress, cancel: -> { upload.reload.status == "cancelled" }
    )
    progress.finish
    # Compare-and-set: a cancel that landed after the import must win over `committed`.
    transition(upload, from: "committing", to: "committed",
               snapshot_id: snapshot.id, progress: nil, finished_at: Time.current)
    Snapshot::Storage.remove(upload)
  rescue Snapshot::Importer::Cancelled
    # The cancel action already set the status and removed the files; leave them alone.
    nil
  rescue Snapshot::Importer::InProgress
    # Another load for this agency owns the upload; never overwrite its status.
    Rails.logger.warn("snapshot commit skipped for upload #{upload.id}: another load is running")
  rescue Snapshot::Importer::Invalid
    transition(upload, from: "committing", to: "failed", progress: nil, finished_at: Time.current,
               error: { "code" => "invalid_snapshot", "message" => "The upload has validation errors" })
  rescue StandardError => e
    fail_upload(upload, e)
  ensure
    release_progress_connection
    Current.agency = previous
  end

  private

  # Every final status write is conditional on `committing`, so a concurrent cancel (or any newer
  # state) is never overwritten.
  def transition(upload, from:, to:, **attributes)
    SnapshotUpload.where(id: upload.id, status: from)
                  .update_all(attributes.merge(status: to, updated_at: Time.current))
  end

  # A dedicated connection so the polled progress is visible while the import transaction is open.
  # In tests the pool hands back the connection the example already uses (shared transactional
  # fixtures), so that one is never checked in — releasing it mid-example would break the example.
  def progress_connection
    @progress_connection ||= ActiveRecord::Base.connection_pool.checkout
  end

  def release_progress_connection
    connection = @progress_connection
    @progress_connection = nil
    return unless connection
    return if connection.equal?(ActiveRecord::Base.connection)

    ActiveRecord::Base.connection_pool.checkin(connection)
  end

  # A readable error only — never a stack trace or row contents.
  def fail_upload(upload, error)
    Rails.logger.error("snapshot import failed for upload #{upload.id} (#{error.class})")
    transition(upload, from: "committing", to: "failed", progress: nil, finished_at: Time.current,
               error: { "code" => "import_failed", "message" => "The snapshot could not be loaded" })
  end
end

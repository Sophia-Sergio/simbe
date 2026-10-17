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
      agency: upload.agency, dir: upload.dir, user: upload.user,
      progress: progress, cancel: -> { upload.reload.status == "cancelled" }
    )
    progress.finish
    upload.update!(status: "committed", snapshot: snapshot, progress: nil, finished_at: Time.current)
    Snapshot::Storage.remove(upload)
  rescue Snapshot::Importer::Cancelled
    # The cancel action already set the status and removed the files.
    upload.update_column(:progress, nil)
  rescue Snapshot::Importer::InProgress
    finish_with_error(upload, "already_in_progress", "A load is already running for this agency")
  rescue Snapshot::Importer::Invalid
    finish_with_error(upload, "invalid_snapshot", "The upload has validation errors")
  rescue StandardError => e
    fail_upload(upload, e)
  ensure
    release_progress_connection
    Current.agency = previous
  end

  private

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

  def finish_with_error(upload, code, message)
    upload.update!(status: "failed", progress: nil, finished_at: Time.current,
                   error: { "code" => code, "message" => message })
  end

  # A readable error only — never a stack trace or row contents.
  def fail_upload(upload, error)
    Rails.logger.error("snapshot import failed for upload #{upload.id} (#{error.class})")
    finish_with_error(upload, "import_failed", "The snapshot could not be loaded")
  end
end

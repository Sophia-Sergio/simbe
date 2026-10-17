class Snapshot::ValidateUploadJob < ApplicationJob
  queue_as :ingest

  # Parses the stored files and writes the report (lane override 1). Runs on the single-threaded
  # `ingest` queue so a 69 MB upload never blocks web requests. `ignored` is the uploaded names
  # that matched none of the seven files (they are not stored on disk).
  def perform(upload, ignored = [])
    return unless upload.status == "validating"

    previous = Current.agency
    Current.agency = upload.agency
    progress = Snapshot::Progress.new(upload)

    progress.update(phase: "parsing", pct: 5)
    rows = Snapshot::Reader.call(upload.dir)
    progress.update(phase: "validating", pct: 50)
    report = Snapshot::Validator.call(agency: upload.agency, dir: upload.dir, rows: rows, ignored: ignored)

    # Compare-and-set: if a cancel landed meanwhile, `cancelled` must win.
    transition(upload, from: "validating", to: "validated",
               report: report, progress: nil, finished_at: Time.current)
  rescue StandardError => e
    fail_upload(upload, e)
  ensure
    Current.agency = previous
  end

  private

  # Every final status write is conditional on the status the job started from, so a concurrent
  # cancel (or a newer state) is never overwritten.
  def transition(upload, from:, to:, **attributes)
    SnapshotUpload.where(id: upload.id, status: from)
                  .update_all(attributes.merge(status: to, updated_at: Time.current))
  end

  # A readable error only — never a stack trace or row contents (docs/conventions/sensitive-data.md).
  def fail_upload(upload, error)
    transition(upload, from: "validating", to: "failed", progress: nil, finished_at: Time.current,
               error: { "code" => "validation_failed", "message" => "The upload could not be validated" })
    Rails.logger.warn("snapshot validation failed for upload #{upload.id} (#{error.class})")
  end
end

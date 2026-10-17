class Snapshot::ValidateUploadJob < ApplicationJob
  queue_as :ingest

  # Parses the stored files and writes the report (lane override 1). Runs on the single-threaded
  # `ingest` queue so a 69 MB upload never blocks web requests.
  def perform(upload)
    return unless upload.status == "validating"

    previous = Current.agency
    Current.agency = upload.agency
    progress = Snapshot::Progress.new(upload)

    progress.update(phase: "parsing", pct: 5)
    rows = Snapshot::Reader.call(upload.dir)
    progress.update(phase: "validating", pct: 50)
    report = Snapshot::Validator.call(agency: upload.agency, dir: upload.dir, rows: rows)

    upload.update!(report: report, status: "validated", progress: nil, finished_at: Time.current)
  rescue StandardError => e
    fail_upload(upload, e)
  ensure
    Current.agency = previous
  end

  private

  # A readable error only — never a stack trace or row contents (docs/conventions/sensitive-data.md).
  def fail_upload(upload, error)
    upload.update!(status: "failed", progress: nil, finished_at: Time.current,
                   error: { "code" => "validation_failed", "message" => "The upload could not be validated" })
    Rails.logger.warn("snapshot validation failed for upload #{upload.id} (#{error.class})")
  end
end

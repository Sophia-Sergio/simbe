# The loaded-snapshot shape and the `GET /snapshots/current` envelope
# (contracts/openapi/schemas/snapshots.yaml#/Snapshot, #/SnapshotCurrent).
class SnapshotSerializer
  # Table → export file name, in export order (`Snapshot::Reader::SPEC` mirrors the seven files).
  FILE_FOR_TABLE = Snapshot::Reader::SPEC.map { |file, spec| [ spec[:table].to_s, file ] }.freeze

  def self.call(snapshot)
    {
      id: snapshot.id,
      as_of: iso(snapshot.as_of),
      loaded_at: iso(snapshot.loaded_at),
      row_counts: snapshot.row_counts || {},
      warnings: snapshot.warnings || []
    }
  end

  # Latest snapshot plus any in-flight upload of this agency (drives "Loading your data…").
  def self.current(agency)
    snapshot = Snapshot.for_agency(agency).latest_first.first
    pending = agency.snapshot_uploads.in_flight.first
    {
      snapshot: snapshot && call(snapshot),
      pending: pending && pending_upload(pending),
      files: files(snapshot)
    }
  end

  def self.pending_upload(upload)
    { upload_id: upload.id, status: upload.status, progress: upload.progress }
  end

  # row_counts keys are table names; the UI shows the CSV export file names instead.
  def self.files(snapshot)
    counts = snapshot&.row_counts || {}
    FILE_FOR_TABLE.filter_map do |table, file|
      next unless counts.key?(table)

      { name: file, rows: counts[table].to_i }
    end
  end

  def self.iso(time)
    time&.utc&.iso8601(3)
  end
end

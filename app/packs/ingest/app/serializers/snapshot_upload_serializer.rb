# The upload lifecycle shape (contracts/openapi/schemas/snapshots.yaml#/SnapshotUpload): every
# key is always present, `progress`/`report`/`snapshot`/`error` are null until they apply.
class SnapshotUploadSerializer
  def self.call(upload)
    {
      id: upload.id,
      status: upload.status,
      progress: upload.progress,
      report: upload.report,
      snapshot: upload.snapshot && SnapshotSerializer.call(upload.snapshot),
      error: upload.error
    }
  end
end

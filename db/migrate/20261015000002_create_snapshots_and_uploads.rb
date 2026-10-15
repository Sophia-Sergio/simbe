# Snapshot domain (ingest pack): a `Snapshot` records a successful load; a `SnapshotUpload`
# tracks the asynchronous upload/validate/commit lifecycle. Not AgencyScoped — explicit belongs_to.
class CreateSnapshotsAndUploads < ActiveRecord::Migration[8.1]
  def change
    create_table :snapshots, id: :uuid do |t|
      t.references :agency, type: :uuid, null: false, foreign_key: true
      t.timestamptz :as_of, null: false
      t.timestamptz :loaded_at
      t.jsonb :row_counts
      t.jsonb :warnings
      t.uuid :loaded_by
      t.uuid :upload_id
      t.timestamptz :created_at, null: false
      t.timestamptz :updated_at, null: false
      t.index %i[agency_id as_of]
    end

    create_table :snapshot_uploads, id: :uuid do |t|
      t.references :agency, type: :uuid, null: false, foreign_key: true
      t.uuid :user_id, null: false
      t.string :status, null: false, default: "validating"
      t.jsonb :progress
      t.jsonb :report
      t.references :snapshot, type: :uuid, null: true, foreign_key: { on_delete: :nullify }
      t.jsonb :error
      t.text :dir
      t.timestamptz :started_at
      t.timestamptz :finished_at
      t.timestamptz :created_at, null: false
      t.timestamptz :updated_at, null: false
      t.index %i[agency_id status]
      # One in-flight job per agency; a violation maps to 409 already_in_progress.
      t.index :agency_id, unique: true, where: "status IN ('validating','committing')",
        name: "index_snapshot_uploads_in_flight_per_agency"
    end
    add_check_constraint :snapshot_uploads,
      "status IN ('validating','validated','committing','committed','failed','cancelled','expired')",
      name: "snapshot_uploads_status_check"
  end
end

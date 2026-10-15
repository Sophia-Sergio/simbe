# Snapshot domain (ingest pack): a `Snapshot` records a successful load; a `SnapshotUpload`
# tracks the asynchronous upload/validate/commit lifecycle. Not AgencyScoped — explicit belongs_to.
class CreateSnapshotsAndUploads < ActiveRecord::Migration[8.1]
  # Composite tenant FK on a nullable reference: Postgres skips the check while the column is NULL, so
  # "no value" stays allowed and any value must belong to the SAME agency. NO ACTION on delete, like
  # the other user references: a referenced user is deactivated, not deleted (an agency delete still
  # cascades, because the check runs at the end of the statement). `ON DELETE SET NULL` is avoided on
  # purpose: on a composite key it would null agency_id too, and schema.rb cannot express the
  # PG 15 column-list form.
  def tenant_fk(table, column, parent)
    add_foreign_key table, parent, column: [ :agency_id, column ], primary_key: [ :agency_id, :id ], name: "fk_#{table}_#{column}_tenant"
  end

  def change
    create_table :snapshots, id: :uuid do |t|
      t.references :agency, type: :uuid, null: false, foreign_key: { on_delete: :cascade }
      t.timestamptz :as_of, null: false
      t.timestamptz :loaded_at
      t.jsonb :row_counts
      t.jsonb :warnings
      t.uuid :loaded_by
      t.uuid :upload_id
      t.timestamptz :created_at, null: false
      t.timestamptz :updated_at, null: false
      t.index %i[agency_id as_of]
      t.index %i[agency_id id], unique: true, name: "index_snapshots_on_agency_id_and_id"
    end

    create_table :snapshot_uploads, id: :uuid do |t|
      t.references :agency, type: :uuid, null: false, foreign_key: { on_delete: :cascade }
      t.uuid :user_id, null: false
      t.string :status, null: false, default: "validating"
      t.jsonb :progress
      t.jsonb :report
      t.references :snapshot, type: :uuid, null: true
      t.jsonb :error
      t.text :dir
      t.timestamptz :started_at
      t.timestamptz :finished_at
      t.timestamptz :created_at, null: false
      t.timestamptz :updated_at, null: false
      t.index %i[agency_id status]
      t.index %i[agency_id id], unique: true, name: "index_snapshot_uploads_on_agency_id_and_id"
      # One in-flight job per agency; a violation maps to 409 already_in_progress.
      t.index :agency_id, unique: true, where: "status IN ('validating','committing')",
        name: "index_snapshot_uploads_in_flight_per_agency"
    end
    add_check_constraint :snapshot_uploads,
      "status IN ('validating','validated','committing','committed','failed','cancelled','expired')",
      name: "snapshot_uploads_status_check"
    add_foreign_key :snapshot_uploads, :users, column: %i[agency_id user_id], primary_key: %i[agency_id id]

    # Every cross reference stays inside one agency (docs/conventions/multi-tenancy.md).
    reversible do |dir|
      dir.up do
        tenant_fk :snapshots, :loaded_by, :users
        tenant_fk :snapshots, :upload_id, :snapshot_uploads
        tenant_fk :snapshot_uploads, :snapshot_id, :snapshots
      end
    end
  end
end

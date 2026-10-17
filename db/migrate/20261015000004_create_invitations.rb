# Invitations (identity pack): an owner invites a coordinator by email.
class CreateInvitations < ActiveRecord::Migration[8.1]
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
    create_table :invitations, id: :uuid do |t|
      t.references :agency, type: :uuid, null: false, foreign_key: { on_delete: :cascade }
      t.uuid :invited_by
      t.string :email, null: false
      t.string :role, null: false, default: "coordinator"
      t.string :coordinator_name
      t.string :token_digest, null: false, index: { unique: true }
      t.timestamptz :expires_at, null: false
      t.timestamptz :accepted_at
      t.timestamptz :created_at, null: false
      t.timestamptz :updated_at, null: false
    end
    add_check_constraint :invitations, "role IN ('coordinator')", name: "invitations_role_check"
    reversible { |dir| dir.up { tenant_fk :invitations, :invited_by, :users } }
  end
end

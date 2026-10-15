# Invitations (identity pack): an owner invites a coordinator by email.
class CreateInvitations < ActiveRecord::Migration[8.1]
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
    # invited_by is nullable by design, so a single-column FK (not composite).
    add_foreign_key :invitations, :users, column: :invited_by, on_delete: :nullify
  end
end

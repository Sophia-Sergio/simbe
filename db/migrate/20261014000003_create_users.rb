class CreateUsers < ActiveRecord::Migration[8.1]
  def change
    create_table :users, id: :uuid do |t|
      t.references :agency, type: :uuid, null: false, foreign_key: { on_delete: :cascade }
      t.string :email, null: false, index: { unique: true }
      t.string :name, null: false
      t.string :password_digest, null: false
      t.string :role, null: false, default: "owner"
      t.string :coordinator_name
      t.timestamptz :created_at, null: false
      t.timestamptz :updated_at, null: false
    end
    add_check_constraint :users, "role IN ('owner','coordinator')", name: "users_role_check"
    # Referenced by the composite (agency_id, user_id) foreign keys on tenant tables, so a row
    # can never point at another agency's user (docs/conventions/database.md, multi-tenancy.md).
    add_index :users, %i[agency_id id], unique: true, name: "index_users_on_agency_id_and_id"
  end
end

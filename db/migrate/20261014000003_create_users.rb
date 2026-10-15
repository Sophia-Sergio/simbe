class CreateUsers < ActiveRecord::Migration[8.1]
  def change
    create_table :users, id: :uuid do |t|
      t.references :agency, type: :uuid, null: false, foreign_key: true
      t.string :email, null: false, index: { unique: true }
      t.string :name, null: false
      t.string :password_digest, null: false
      t.string :role, null: false, default: "owner"
      t.string :coordinator_name
      t.timestamps
    end
    add_check_constraint :users, "role IN ('owner','coordinator')", name: "users_role_check"
  end
end

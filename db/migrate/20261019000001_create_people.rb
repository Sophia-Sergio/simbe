# A person is one email inside one agency (a lead is one inquiry; the same person can inquire again).
# Identity only: no per-person attributes. leads.person_id is filled by the next migration and made
# NOT NULL by the one after (data work never shares a migration with schema work).
class CreatePeople < ActiveRecord::Migration[8.1]
  def change
    create_table :people, id: :uuid do |t|
      t.uuid :agency_id, null: false
      t.string :email_key
      t.timestamptz :created_at, null: false
      t.timestamptz :updated_at, null: false
    end
    add_index :people, %i[agency_id id], unique: true
    add_index :people, %i[agency_id email_key], unique: true, where: "email_key IS NOT NULL"
    add_foreign_key :people, :agencies, on_delete: :cascade

    add_column :leads, :person_id, :uuid
  end
end

class CreateAgencies < ActiveRecord::Migration[8.1]
  def change
    enable_extension "pgcrypto" unless extension_enabled?("pgcrypto")

    create_table :agencies, id: :uuid do |t|
      t.string :name, null: false
      t.string :slug, null: false, index: { unique: true }
      t.string :timezone, null: false, default: "America/Los_Angeles"
      t.string :qualified_milestone, null: false, default: "consult_attended"
      t.timestamps
    end
    add_check_constraint :agencies, "qualified_milestone IN ('application_submitted','consult_attended','records','accepted')", name: "agencies_milestone_check"
  end
end

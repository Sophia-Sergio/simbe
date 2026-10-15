class CreateAuthSessions < ActiveRecord::Migration[8.1]
  def change
    create_table :auth_sessions, id: :uuid do |t|
      t.references :user, type: :uuid, null: false, foreign_key: { on_delete: :cascade }
      t.string :token_digest, null: false, index: { unique: true }
      t.timestamptz :expires_at, null: false
      t.timestamptz :created_at, null: false
      t.timestamptz :updated_at, null: false
    end
  end
end

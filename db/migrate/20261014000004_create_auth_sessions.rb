class CreateAuthSessions < ActiveRecord::Migration[8.1]
  def change
    create_table :auth_sessions, id: :uuid do |t|
      t.references :user, type: :uuid, null: false, foreign_key: true
      t.string :token_digest, null: false, index: { unique: true }
      t.datetime :expires_at, null: false
      t.timestamps
    end
  end
end

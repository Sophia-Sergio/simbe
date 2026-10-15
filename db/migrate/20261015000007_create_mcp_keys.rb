# MCP pack: API keys bound to one agency. Not AgencyScoped — explicit belongs_to + scoping.
class CreateMcpKeys < ActiveRecord::Migration[8.1]
  def change
    create_table :mcp_keys, id: :uuid do |t|
      t.references :agency, type: :uuid, null: false, foreign_key: true
      t.string :key_digest, null: false, index: { unique: true }
      t.string :prefix, null: false
      t.uuid :created_by
      t.timestamptz :revoked_at
      t.timestamptz :created_at, null: false
      t.timestamptz :updated_at, null: false
    end
  end
end

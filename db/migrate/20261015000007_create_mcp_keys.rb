# MCP pack: API keys bound to one agency. Not AgencyScoped — explicit belongs_to + scoping.
class CreateMcpKeys < ActiveRecord::Migration[8.1]
  def change
    create_table :mcp_keys, id: :uuid do |t|
      t.references :agency, type: :uuid, null: false, foreign_key: { on_delete: :cascade }
      t.string :key_digest, null: false, index: { unique: true }
      t.string :prefix, null: false
      t.uuid :created_by
      t.timestamptz :revoked_at
      t.timestamptz :created_at, null: false
      t.timestamptz :updated_at, null: false
    end
    # created_by is nullable by design, so a single-column FK (not composite).
    add_foreign_key :mcp_keys, :users, column: :created_by, on_delete: :nullify
  end
end

# MCP pack: API keys bound to one agency. Not AgencyScoped — explicit belongs_to + scoping.
class CreateMcpKeys < ActiveRecord::Migration[8.1]
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
    create_table :mcp_keys, id: :uuid do |t|
      t.references :agency, type: :uuid, null: false, foreign_key: { on_delete: :cascade }
      t.string :key_digest, null: false, index: { unique: true }
      t.string :prefix, null: false
      t.uuid :created_by
      t.timestamptz :revoked_at
      t.timestamptz :created_at, null: false
      t.timestamptz :updated_at, null: false
    end
    reversible { |dir| dir.up { tenant_fk :mcp_keys, :created_by, :users } }
  end
end

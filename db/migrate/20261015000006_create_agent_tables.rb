# Agent pack: conversations, their messages (no agency_id — reached via the conversation) and
# per-call AI usage. Messages cascade from their conversation.
class CreateAgentTables < ActiveRecord::Migration[8.1]
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
    create_table :agent_conversations, id: :uuid do |t|
      t.references :agency, type: :uuid, null: false, foreign_key: { on_delete: :cascade }
      t.uuid :user_id, null: false
      t.string :title
      t.timestamptz :turn_started_at
      t.timestamptz :created_at, null: false
      t.timestamptz :updated_at, null: false
      t.index %i[agency_id id], unique: true, name: "index_agent_conversations_on_agency_id_and_id"
    end
    add_foreign_key :agent_conversations, :users, column: %i[agency_id user_id], primary_key: %i[agency_id id]

    create_table :agent_messages, id: :uuid do |t|
      t.references :conversation, type: :uuid, null: false,
        foreign_key: { to_table: :agent_conversations, on_delete: :cascade }
      t.string :role, null: false
      t.jsonb :body
      t.jsonb :api_content
      t.timestamptz :created_at, null: false
      t.timestamptz :updated_at, null: false
    end
    add_check_constraint :agent_messages, "role IN ('user','assistant')", name: "agent_messages_role_check"

    create_table :ai_usage_events, id: :uuid do |t|
      t.references :agency, type: :uuid, null: false, foreign_key: { on_delete: :cascade }
      t.uuid :user_id, null: false
      t.uuid :conversation_id
      t.string :task
      t.string :model
      t.integer :input_tokens
      t.integer :output_tokens
      t.integer :cost_cents
      t.timestamptz :created_at, null: false
      t.timestamptz :updated_at, null: false
      t.index %i[agency_id created_at]
    end
    add_foreign_key :ai_usage_events, :users, column: %i[agency_id user_id], primary_key: %i[agency_id id]
    reversible { |dir| dir.up { tenant_fk :ai_usage_events, :conversation_id, :agent_conversations } }
  end
end

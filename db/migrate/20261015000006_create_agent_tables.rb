# Agent pack: conversations, their messages (no agency_id — reached via the conversation) and
# per-call AI usage. Messages cascade from their conversation.
class CreateAgentTables < ActiveRecord::Migration[8.1]
  def change
    create_table :agent_conversations, id: :uuid do |t|
      t.references :agency, type: :uuid, null: false, foreign_key: { on_delete: :cascade }
      t.uuid :user_id, null: false
      t.string :title
      t.timestamptz :turn_started_at
      t.timestamptz :created_at, null: false
      t.timestamptz :updated_at, null: false
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
  end
end

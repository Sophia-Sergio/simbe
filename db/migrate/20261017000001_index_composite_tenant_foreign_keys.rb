# Every composite tenant FK (agency_id, x) needs a composite index on the child. Without one Postgres has to scan
# the child per deleted or updated parent row: replacing a 600k-lead snapshot (DELETE FROM leads cascading into
# seven tables) ran for 19+ minutes in B-INGEST. Found by the ingest golden spec.
class IndexCompositeTenantForeignKeys < ActiveRecord::Migration[8.1]
  INDEXES = {
    agent_conversations: %i[agency_id user_id],
    ai_usage_events: [ %i[agency_id conversation_id], %i[agency_id user_id] ],
    applications: %i[agency_id lead_id],
    appointments: %i[agency_id lead_id],
    contacts: %i[agency_id lead_id],
    invitations: %i[agency_id invited_by],
    lead_facts: %i[agency_id lead_id],
    mcp_keys: %i[agency_id created_by],
    screener_answers: %i[agency_id lead_id],
    snapshot_uploads: [ %i[agency_id snapshot_id], %i[agency_id user_id] ],
    snapshots: [ %i[agency_id upload_id], %i[agency_id loaded_by] ],
    stage_events: %i[agency_id lead_id],
    web_sessions: %i[agency_id lead_id]
  }.freeze

  def change
    INDEXES.each do |table, spec|
      column_sets = spec.first.is_a?(Array) ? spec : [ spec ]
      column_sets.each do |columns|
        add_index table, columns, name: "idx_#{table}_#{columns.join('_')}".first(63), if_not_exists: true
      end
    end
  end
end

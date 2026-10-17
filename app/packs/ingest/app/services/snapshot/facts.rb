# Shared read-model: the per-lead derived facts every metrics/leads read-model queries.
#
# Idempotent replace: inside a single transaction the agency's rows are deleted and
# recomputed, so a re-run never double counts and a failure rolls back to the previous
# facts (docs/conventions/database.md). SQL only, never a Ruby loop over leads, and the
# agency id always arrives as a bind parameter (docs/conventions/multi-tenancy.md).
# `Snapshot` is the ingest model class; the services live under it as a namespace.
class Snapshot
  module Facts
    DELETE_SQL = "DELETE FROM lead_facts WHERE agency_id = $1".freeze

    INSERT_SQL = <<~SQL.freeze
      INSERT INTO lead_facts (
        id, agency_id, lead_id,
        application_submitted_at, consult_attended_at, records_at, accepted_at,
        furthest_stage, first_outbound_at, first_response_minutes,
        last_contact_at, last_inbound_at,
        screener_met, screener_review, screener_not_met, screener_total,
        created_at, updated_at
      )
      SELECT
        gen_random_uuid(), s.agency_id, s.lead_id,
        s.application_submitted_at, s.consult_attended_at, s.records_at, s.accepted_at,
        s.furthest_stage, s.first_outbound_at,
        round(extract(epoch FROM (s.first_outbound_at - s.lead_created_at)) / 60)::int,
        s.last_contact_at, s.last_inbound_at,
        s.screener_met, s.screener_review, s.screener_not_met, s.screener_total,
        now(), now()
      FROM (
        SELECT
          l.agency_id, l.id AS lead_id, l.lead_created_at,
          (SELECT min(a.submitted_at) FROM applications a WHERE a.lead_id = l.id) AS application_submitted_at,
          (SELECT min(coalesce(ap.scheduled_for, ap.booked_at)) FROM appointments ap
             WHERE ap.lead_id = l.id AND ap.status = 'attended') AS consult_attended_at,
          (SELECT max(se.entered_at) FROM stage_events se
             WHERE se.lead_id = l.id AND se.stage = 'records') AS records_at,
          (SELECT max(se.entered_at) FROM stage_events se
             WHERE se.lead_id = l.id AND se.stage = 'accepted') AS accepted_at,
          (SELECT se.stage FROM stage_events se
             WHERE se.lead_id = l.id
             ORDER BY array_position(
               ARRAY['inquiry','pre_screen','application','consult','records','accepted'], se.stage
             ) DESC
             LIMIT 1) AS furthest_stage,
          (SELECT min(c.contacted_at) FROM contacts c
             WHERE c.lead_id = l.id AND c.direction = 'outbound') AS first_outbound_at,
          (SELECT max(c.contacted_at) FROM contacts c WHERE c.lead_id = l.id) AS last_contact_at,
          (SELECT max(c.contacted_at) FROM contacts c
             WHERE c.lead_id = l.id AND c.direction = 'inbound') AS last_inbound_at,
          (SELECT count(*) FROM screener_answers sa
             WHERE sa.lead_id = l.id AND sa.meets_requirement = 'yes') AS screener_met,
          (SELECT count(*) FROM screener_answers sa
             WHERE sa.lead_id = l.id AND sa.meets_requirement = 'review') AS screener_review,
          (SELECT count(*) FROM screener_answers sa
             WHERE sa.lead_id = l.id AND sa.meets_requirement = 'no') AS screener_not_met,
          (SELECT count(*) FROM screener_answers sa WHERE sa.lead_id = l.id) AS screener_total
        FROM leads l
        WHERE l.agency_id = $1
      ) s
    SQL

    # Replaces the agency's lead_facts in one transaction. Returns nothing; callers read
    # the rows back through the LeadFact model.
    def self.call(agency_id)
      ActiveRecord::Base.transaction do
        connection.exec_query(DELETE_SQL, "Snapshot::Facts", [ bind(agency_id) ])
        connection.exec_query(INSERT_SQL, "Snapshot::Facts", [ bind(agency_id) ])
      end
    end

    def self.bind(agency_id)
      ActiveRecord::Relation::QueryAttribute.new("agency_id", agency_id, ActiveRecord::Type::String.new)
    end

    def self.connection
      ActiveRecord::Base.connection
    end
  end
end

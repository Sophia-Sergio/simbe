# Shared read-model: the single SQL source of next-action queue membership, reused by the
# board, next actions, coordinator stats and status (docs/conventions/database.md — heavy
# logic is SQL, never a Ruby loop over leads). `agency_id` and the other inputs always
# arrive as named binds (properly quoted by the adapter), never concatenated into the SQL
# (docs/conventions/multi-tenancy.md).
#
# `SQL_CTE` is the reusable `base`/`queued` CTE (the board lane appends its own SELECT).
# `Leads` is the pack namespace; `Lead` (singular) is the model, and `Snapshot` belongs to
# the ingest pack (allowlisted edge leads->ingest).
module Leads
  module Queues
    KEYS = %w[text_back_now nudge_applications rebook_consults paused_due_back].freeze

    # base = one row per lead with the columns every queue decision needs; queued = base plus
    # the queue the lead belongs to (nil when it is not queued). The four queue rules are
    # mutually exclusive in the order written, so each lead lands in at most one queue.
    SQL_CTE = <<~SQL.freeze
      WITH base AS (
        SELECT l.id, l.external_id, l.first_name || ' ' || l.last_name AS name, l.lead_created_at, l.current_stage, l.outcome,
               l.paused_until, l.coordinator_name, f.first_outbound_at, f.last_contact_at,
               ap.started_at AS app_started_at, ap.submitted_at AS app_submitted_at, ap.percent_complete, ap.last_section_completed,
               pa.status AS appt_status, pa.scheduled_for AS appt_at
        FROM leads l
        JOIN lead_facts f ON f.lead_id = l.id
        LEFT JOIN LATERAL (SELECT * FROM applications a WHERE a.lead_id = l.id ORDER BY a.started_at DESC LIMIT 1) ap ON true
        LEFT JOIN LATERAL (SELECT * FROM appointments p WHERE p.lead_id = l.id ORDER BY p.booked_at DESC LIMIT 1) pa ON true
        WHERE l.agency_id = :agency_id AND (:coordinator::text IS NULL OR l.coordinator_name = :coordinator)
      ), queued AS (
        SELECT *, CASE
          WHEN outcome = 'open' AND first_outbound_at IS NULL THEN 'text_back_now'
          WHEN outcome = 'open' AND current_stage = 'application' AND app_started_at IS NOT NULL AND app_submitted_at IS NULL
               AND (last_contact_at IS NULL OR last_contact_at < :as_of::timestamptz - interval '24 hours') THEN 'nudge_applications'
          WHEN outcome = 'open' AND appt_status = 'no_show' THEN 'rebook_consults'
          WHEN outcome = 'paused' AND paused_until <= :as_of_date::date THEN 'paused_due_back'
        END AS queue
        FROM base
      )
    SQL

    # `age_minutes` is how long the lead has been waiting in its queue, measured back from the
    # snapshot as_of; rows come out oldest first.
    SQL = <<~SQL.freeze
      #{SQL_CTE}
      SELECT id, external_id, name, queue, coordinator_name, percent_complete, last_section_completed, appt_at, paused_until,
        (extract(epoch FROM (CASE queue
           WHEN 'text_back_now' THEN :as_of::timestamptz - lead_created_at
           WHEN 'nudge_applications' THEN :as_of::timestamptz - coalesce(last_contact_at, app_started_at)
           WHEN 'rebook_consults' THEN :as_of::timestamptz - appt_at
           ELSE :as_of::timestamptz - paused_until::timestamptz END)) / 60)::int AS age_minutes
      FROM queued WHERE queue IS NOT NULL ORDER BY age_minutes DESC
    SQL

    # -> Array<Hash> with { lead_id:, external_id:, name:, queue:, age_minutes:, reason:,
    # coordinator_name: }, oldest first. `coordinator` nil means every coordinator (a
    # coordinator user is scoped by callers through Leads::Access). `as_of` defaults to the
    # agency's latest snapshot; an agency without a snapshot has no queues -> [].
    def self.call(agency:, coordinator: nil, as_of: nil)
      as_of ||= latest_as_of(agency)
      return [] if as_of.nil?

      query(agency, as_of, coordinator).map { |row| shape(agency, row) }
    end

    def self.latest_as_of(agency)
      Snapshot.for_agency(agency).latest_first.first&.as_of
    end

    def self.query(agency, as_of, coordinator)
      sql = ActiveRecord::Base.sanitize_sql_array(
        [ SQL, { agency_id: agency.id, as_of: as_of, as_of_date: as_of.to_date, coordinator: coordinator } ]
      )
      ActiveRecord::Base.connection.select_all(sql, "Leads::Queues").to_a
    end

    def self.shape(agency, row)
      {
        lead_id: row["id"],
        external_id: row["external_id"],
        name: row["name"],
        queue: row["queue"],
        age_minutes: row["age_minutes"],
        reason: reason(agency, row),
        coordinator_name: row["coordinator_name"]
      }
    end

    # Human-readable reason, built here (not in SQL) from the returned columns, with dates in
    # the agency's time zone.
    def self.reason(agency, row)
      case row["queue"]
      when "text_back_now" then "New lead · no message sent yet"
      when "nudge_applications" then "Application #{row['percent_complete']}% · quiet #{row['age_minutes'] / 1440}d"
      when "rebook_consults" then "No-show #{local_date(row['appt_at'], agency)} · not rebooked"
      when "paused_due_back" then "Paused until #{local_date(row['paused_until'], agency)} · due back"
      end
    end

    def self.local_date(value, agency)
      return nil if value.nil?
      return value.strftime("%b %-d") if value.is_a?(Date)

      value.in_time_zone(agency.timezone).strftime("%b %-d")
    end
  end
end

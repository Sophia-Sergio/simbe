# Owner-only coordinator performance (spec 2008, decision 9): one card per coordinator_name over
# ALL leads in the snapshot (the endpoint has no range), plus a detail with four KPIs and the
# leads needing action.
#
# Heavy aggregates are SQL (docs/conventions/database.md): one grouped query for leads/qualified/
# median first-reply and one pass over the shared queue read-model for `overdue`. `qualified` is
# the agency's configured milestone, mapped to its lead_facts timestamp column by AgencyMilestones
# (config, not a column). `Leads` is the pack namespace; `Lead`/`LeadFact` are models.
module Leads
  module CoordinatorStats
    # "needs_support when overdue > 8" (spec 2008 decision 9 / contracts schemas/coordinators.yaml).
    NEEDS_SUPPORT_THRESHOLD = 8

    # One row per coordinator: leads, share of the agency's leads, qualified under the agency
    # milestone and the median first-reply minutes. Rounding is numeric half-up in SQL, matching
    # the golden oracle (bin/golden-numbers rate/rd). Ordered by leads desc, name asc (stable for
    # ties, matching coordinators_all_time).
    def self.call(agency:)
      overdue = overdue_by_coordinator(agency)
      aggregate_rows(agency).map { |row| row_hash(row, overdue.fetch(row["name"], 0)) }
    end

    # { **row, kpis: { leads:, qualified:, qualified_rate:, first_reply_minutes: },
    #   needs_action: [{ lead_id:, name:, queue:, age_minutes:, reason: }] } — unknown name 404s.
    # needs_action is ordered by queue (fixed order) then oldest first.
    def self.detail(agency:, name:)
      row = call(agency: agency).find { |candidate| candidate[:name] == name }
      raise ActiveRecord::RecordNotFound, "unknown coordinator #{name.inspect}" if row.nil?

      {
        **row,
        kpis: {
          leads: row[:leads],
          qualified: row[:qualified],
          qualified_rate: row[:qualified_rate],
          first_reply_minutes: row[:first_reply_minutes]
        },
        needs_action: needs_action(agency, name)
      }
    end

    # The leads in the queues, scoped to one coordinator, by queue then oldest first.
    def self.needs_action(agency, name)
      rows = Queues.call(agency: agency, coordinator: name)
                  .sort_by { |row| [ Queues::KEYS.index(row[:queue]), -row[:age_minutes] ] }
      sections = NextActions.nudge_sections(rows)
      rows.map do |row|
        { lead_id: row[:external_id], name: row[:name], queue: row[:queue],
          age_minutes: row[:age_minutes], reason: NextActions.reason(row, sections) }
      end
    end

    # leads in queues 1-3 (never paused_due_back) older than 24h, per coordinator.
    def self.overdue_by_coordinator(agency)
      Queues.call(agency: agency)
            .select { |row| row[:queue] != "paused_due_back" && row[:age_minutes] > 24 * 60 }
            .each_with_object(Hash.new(0)) { |row, counts| counts[row[:coordinator_name]] += 1 }
    end

    def self.row_hash(row, overdue)
      {
        name: row["name"],
        leads: row["leads"],
        share_pct: row["share_pct"].to_f,
        first_reply_minutes: row["first_reply_minutes"]&.to_f,
        qualified: row["qualified"],
        qualified_rate: row["qualified_rate"].to_f,
        overdue: overdue,
        status: overdue > NEEDS_SUPPORT_THRESHOLD ? "needs_support" : "on_track"
      }
    end

    # `milestone` is a column name from the frozen AgencyMilestones::COLUMNS whitelist (never user
    # input), so interpolating it into the SQL is safe; every value arrives as a bind.
    def self.aggregate_rows(agency)
      milestone = AgencyMilestones::COLUMNS.fetch(agency.qualified_milestone)
      sql = ActiveRecord::Base.sanitize_sql_array([ aggregate_sql(milestone), { agency_id: agency.id } ])
      ActiveRecord::Base.connection.select_all(sql, "Leads::CoordinatorStats").to_a
    end

    def self.aggregate_sql(milestone)
      <<~SQL
        WITH totals AS (
          SELECT count(*)::numeric AS total FROM leads WHERE agency_id = :agency_id
        )
        SELECT l.coordinator_name AS name,
               count(*)::int AS leads,
               round(100.0 * count(*) / t.total, 1) AS share_pct,
               count(*) FILTER (WHERE f.#{milestone} IS NOT NULL)::int AS qualified,
               round(100.0 * count(*) FILTER (WHERE f.#{milestone} IS NOT NULL) / count(*), 1) AS qualified_rate,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY f.first_response_minutes) AS first_reply_minutes
        FROM leads l
        JOIN lead_facts f ON f.lead_id = l.id
        CROSS JOIN totals t
        WHERE l.agency_id = :agency_id AND l.coordinator_name IS NOT NULL
        GROUP BY l.coordinator_name, t.total
        ORDER BY leads DESC, name ASC
      SQL
    end
  end
end

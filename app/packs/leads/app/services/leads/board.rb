# The pipeline board (spec 2008 decision 3): four columns, each lead in exactly one, up to
# 25 cards per column plus the true count for the badge. Membership is decided in SQL over
# the shared `Leads::Queues::SQL_CTE`, never a Ruby loop over leads
# (docs/conventions/database.md); the qualified column uses the agency's configured milestone
# (spec decision 5 / docs/conventions/ real-data: `qualified` is config, not a column).
module Leads
  module Board
    # Column order as the contract/fixture list them.
    COLUMNS = %w[action_needed in_application consult qualified].freeze
    PER_COLUMN = 25

    # Milestone name -> the lead_facts timestamp that proves it. A fixed whitelist, so the
    # column can be interpolated into the SQL safely (it comes from the agency, but only
    # these keys are ever inserted).
    MILESTONE_COLUMNS = {
      "application_submitted" => "application_submitted_at",
      "consult_attended" => "consult_attended_at",
      "records" => "records_at",
      "accepted" => "accepted_at"
    }.freeze

    # -> { columns: { action_needed: { count:, leads: [LeadCard] }, … } }. `coordinator`
    # filters for owners only; a coordinator is always scoped to their own leads.
    def self.call(user:, coordinator: nil)
      rows = query(coordinator_for(user, coordinator))
      leads = leads_by_id(rows.map { |row| row["id"] })
      grouped = rows.group_by { |row| row["col"] }

      { columns: COLUMNS.to_h { |key| [ key.to_sym, column(grouped[key], leads) ] } }
    end

    def self.coordinator_for(user, coordinator)
      user.owner? ? coordinator.presence : user.coordinator_name
    end

    def self.column(rows, leads)
      return { count: 0, leads: [] } if rows.nil?

      { count: rows.first["cnt"], leads: rows.map { |row| LeadCardSerializer.call(lead: leads.fetch(row["id"]), queue: row["queue"]) } }
    end

    # Both the count and the row number come from window functions, so one query returns the
    # four true counts and up to 25 ids per column.
    def self.query(coordinator)
      agency = Current.agency
      as_of = Leads::Queues.latest_as_of(agency)
      return [] if as_of.nil?

      binds = {
        agency_id: agency.id,
        as_of: as_of,
        as_of_date: as_of.in_time_zone(agency.timezone).to_date,
        coordinator: coordinator
      }
      ActiveRecord::Base.connection.select_all(
        ActiveRecord::Base.sanitize_sql_array([ sql(agency.qualified_milestone), binds ]), "Leads::Board"
      ).to_a
    end

    def self.sql(milestone)
      milestone_column = MILESTONE_COLUMNS.fetch(milestone)
      <<~SQL
        #{Leads::Queues::SQL_CTE}
        , ranked AS (
          SELECT q.id, q.queue,
            CASE
              WHEN q.outcome IN ('open', 'accepted') AND f.#{milestone_column} IS NOT NULL THEN 'qualified'
              WHEN q.queue IS NOT NULL OR (q.outcome = 'open' AND q.current_stage IN ('inquiry', 'pre_screen')) THEN 'action_needed'
              WHEN q.outcome = 'open' AND q.current_stage = 'application' THEN 'in_application'
              WHEN q.outcome = 'open' AND q.current_stage = 'consult' THEN 'consult'
            END AS col,
            coalesce(q.last_contact_at, q.lead_created_at) AS sort_at
          FROM queued q JOIN lead_facts f ON f.lead_id = q.id
        ), numbered AS (
          SELECT id, queue, col,
            row_number() OVER (PARTITION BY col ORDER BY sort_at DESC, id DESC) AS rn,
            count(*) OVER (PARTITION BY col) AS cnt
          FROM ranked WHERE col IS NOT NULL
        )
        SELECT id, queue, col, cnt, rn FROM numbered WHERE rn <= #{PER_COLUMN} ORDER BY col, rn
      SQL
    end

    def self.leads_by_id(ids)
      return {} if ids.empty?

      Lead.where(id: ids).includes(:lead_fact, :screener_answers).index_by(&:id)
    end
  end
end

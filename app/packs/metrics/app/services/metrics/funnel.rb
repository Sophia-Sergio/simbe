# The six-row funnel plus exit reasons and form drop-off (spec 2004 decision 3).
# Counts are cohort-based: only leads created in the window; "reached" means the lead
# ever entered that stage in the snapshot. All heavy work is SQL; the agency id and
# window bounds are binds (docs/conventions/multi-tenancy.md).
module Metrics
  module Funnel
    STAGES = [
      { key: "inquiry", label: "Inquiry" },
      { key: "application", label: "Application" },
      { key: "consult_booked", label: "Consult booked" },
      { key: "consult_attended", label: "Attended consult" },
      { key: "records", label: "Records" },
      { key: "accepted", label: "Accepted" }
    ].freeze

    # Which funnel row carries `qualified: true` for each agency milestone.
    MILESTONE_STAGE = {
      "application_submitted" => "application",
      "consult_attended" => "consult_attended",
      "records" => "records",
      "accepted" => "accepted"
    }.freeze

    UNTAGGED = "(none)".freeze

    # One row per cohort lead with the flags every funnel/exit-reason decision needs.
    COHORT_SQL = <<~SQL.freeze
      cohort AS (
        SELECT l.id AS lead_id, l.outcome, l.outcome_reason,
               f.furthest_stage, f.consult_attended_at, f.records_at, f.accepted_at,
               EXISTS (SELECT 1 FROM stage_events se WHERE se.lead_id = l.id AND se.stage = 'consult') AS booked,
               (f.furthest_stage IN ('application','consult','records','accepted')) AS has_app
        FROM leads l
        JOIN lead_facts f ON f.lead_id = l.id
        WHERE l.agency_id = :agency_id AND l.lead_created_at >= :from AND l.lead_created_at <= :to
      )
    SQL

    COUNTS_SQL = <<~SQL.freeze
      WITH #{COHORT_SQL}
      SELECT
        count(*) AS inquiry,
        count(*) FILTER (WHERE has_app) AS application,
        count(*) FILTER (WHERE booked) AS consult_booked,
        count(*) FILTER (WHERE consult_attended_at IS NOT NULL) AS consult_attended,
        count(*) FILTER (WHERE records_at IS NOT NULL) AS records,
        count(*) FILTER (WHERE accepted_at IS NOT NULL) AS accepted
      FROM cohort
    SQL

    # Closed leads land in the highest row they reached; reason falls back to the outcome
    # when outcome_reason is blank (matching the independent oracle).
    EXIT_REASONS_SQL = <<~SQL.freeze
      WITH #{COHORT_SQL},
      staged AS (
        SELECT outcome, outcome_reason,
               CASE
                 WHEN accepted_at IS NOT NULL THEN 'accepted'
                 WHEN records_at IS NOT NULL THEN 'records'
                 WHEN consult_attended_at IS NOT NULL THEN 'consult_attended'
                 WHEN booked THEN 'consult_booked'
                 WHEN has_app THEN 'application'
                 ELSE 'inquiry'
               END AS top_stage
        FROM cohort
      ),
      ranked AS (
        SELECT top_stage,
               coalesce(nullif(outcome_reason, ''), outcome) AS reason,
               count(*) AS n,
               row_number() OVER (PARTITION BY top_stage
                                  ORDER BY count(*) DESC, coalesce(nullif(outcome_reason, ''), outcome) ASC) AS rn
        FROM staged
        WHERE outcome IN ('not_eligible', 'withdrew', 'unresponsive')
        GROUP BY top_stage, coalesce(nullif(outcome_reason, ''), outcome)
      )
      SELECT top_stage, reason, n FROM ranked WHERE rn <= 2 ORDER BY top_stage, rn
    SQL

    # Unsubmitted applications in the cohort, grouped by the last section completed.
    FORM_DROPOFF_SQL = <<~SQL.freeze
      WITH cohort AS (
        SELECT l.id AS lead_id FROM leads l
        WHERE l.agency_id = :agency_id AND l.lead_created_at >= :from AND l.lead_created_at <= :to
      )
      SELECT coalesce(nullif(a.last_section_completed, ''), :untagged) AS section, count(*) AS n
      FROM applications a
      JOIN cohort c ON c.lead_id = a.lead_id
      WHERE a.submitted_at IS NULL
      GROUP BY 1
      ORDER BY n DESC, section ASC
    SQL

    # -> { total:, stages: [...], form_dropoff: [...] } for the agency's own definition.
    def self.call(agency:, range: "30d")
      base = Metrics::Base.new(agency: agency, range: range)
      return empty(agency.qualified_milestone) if base.snapshot.nil?

      base.cached("funnel") { build(base) }
    end

    # -> { from_stage:, to_stage:, lost:, pct_lost: } for the largest absolute drop, or nil
    # when no leads reached the top row (no funnel to leak from).
    def self.leak(stages)
      return nil if stages.empty? || stages.first[:count].to_i.zero?

      from, to = stages.each_cons(2).max_by { |left, right| left[:count] - right[:count] }
      lost = from[:count] - to[:count]
      { from_stage: from[:label], to_stage: to[:label], lost: lost, pct_lost: Metrics::Base.rate(lost, from[:count]) }
    end

    def self.build(base)
      counts = base.rows(COUNTS_SQL).first
      reasons = base.rows(EXIT_REASONS_SQL).group_by { |row| row[:top_stage] }
      total = counts[:inquiry].to_i
      qualified_stage = MILESTONE_STAGE.fetch(base.agency.qualified_milestone)

      stages = STAGES.each_with_index.map do |stage, index|
        count = counts.fetch(stage[:key].to_sym).to_i
        previous = index.zero? ? nil : counts.fetch(STAGES[index - 1][:key].to_sym).to_i
        {
          key: stage[:key],
          label: stage[:label],
          count: count,
          pct_of_previous: index.zero? ? nil : Metrics::Base.rate(count, previous),
          pct_of_total: Metrics::Base.rate(count, total),
          qualified: stage[:key] == qualified_stage,
          exit_reasons: (reasons[stage[:key]] || []).map { |row| { reason: row[:reason], count: row[:n].to_i } }
        }
      end

      { total: total, stages: stages, form_dropoff: form_dropoff(base) }
    end

    def self.form_dropoff(base)
      rows = base.rows(FORM_DROPOFF_SQL, untagged: UNTAGGED)
      total = rows.sum { |row| row[:n].to_i }
      rows.map { |row| { section: row[:section], count: row[:n].to_i, pct: Metrics::Base.rate(row[:n].to_i, total) } }
    end

    def self.empty(milestone)
      qualified_stage = MILESTONE_STAGE.fetch(milestone)
      stages = STAGES.map do |stage|
        { key: stage[:key], label: stage[:label], count: 0, pct_of_previous: nil, pct_of_total: 0.0,
          qualified: stage[:key] == qualified_stage, exit_reasons: [] }
      end
      { total: 0, stages: stages, form_dropoff: [] }
    end
  end
end

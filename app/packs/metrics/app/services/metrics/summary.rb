# KPIs, deltas and the biggest funnel leak (spec 2004 decisions 1, 2).
# The cohort is leads created in the window; "qualified" counts those that ever reached
# the agency's milestone. The previous period is the equal-length window before it, and a
# delta is null when that window has no leads.
module Metrics
  module Summary
    TOTALS_SQL = <<~SQL.freeze
      SELECT count(*) AS leads, count(f.%<qcol>s) AS qualified, count(DISTINCT l.person_id) AS unique_people
      FROM leads l JOIN lead_facts f ON f.lead_id = l.id
      WHERE l.agency_id = :agency_id AND l.lead_created_at >= :from AND l.lead_created_at <= :to
    SQL

    PREVIOUS_SQL = <<~SQL.freeze
      SELECT count(*) AS leads, count(f.%<qcol>s) AS qualified
      FROM leads l JOIN lead_facts f ON f.lead_id = l.id
      WHERE l.agency_id = :agency_id AND l.lead_created_at >= :prev_from AND l.lead_created_at < :prev_to
    SQL

    LOW_SAMPLE_LEADS = 30

    def self.call(agency:, range: "30d")
      base = Metrics::Base.new(agency: agency, range: range)
      return empty(range) if base.snapshot.nil?

      base.cached("summary") { build(base) }
    end

    def self.build(base)
      agency = base.agency
      current = totals(base, TOTALS_SQL)
      previous = totals(base, PREVIOUS_SQL)

      leads = current[:leads].to_i
      qualified = current[:qualified].to_i
      {
        snapshot: base.snapshot,
        range: base.range,
        kpis: kpis(leads: leads, qualified: qualified, previous: previous, unique_people: current[:unique_people].to_i),
        biggest_leak: Metrics::Funnel.leak(Metrics::Funnel.call(agency: agency, range: base.range)[:stages])
      }
    end

    def self.kpis(leads:, qualified:, previous:, unique_people:)
      previous_leads = previous[:leads].to_i
      previous_qualified = previous[:qualified].to_i
      rate = Metrics::Base.rate(qualified, leads)
      previous_rate = previous_leads.zero? ? nil : Metrics::Base.rate(previous_qualified, previous_leads)

      {
        leads: kpi(leads, previous_leads, previous_leads),
        qualified: kpi(qualified, previous_qualified, previous_leads),
        qualified_rate: { value: rate, previous: previous_rate,
                          delta: previous_rate.nil? ? nil : (rate - previous_rate).round(1),
                          low_sample: leads < LOW_SAMPLE_LEADS },
        # Distinct people behind the leads (a lead is one inquiry; the same person can inquire again).
        unique_people: unique_people
      }
    end

    # `previous` is the previous window's count; it is null only when that window had no
    # leads at all (`previous_leads` zero), not merely when the count is zero — otherwise a
    # real drop to zero qualified would lose its delta.
    def self.kpi(value, previous, previous_leads)
      return { value: value, previous: nil, delta: nil } if previous_leads.to_i.zero?

      { value: value, previous: previous.to_i, delta: value - previous.to_i }
    end

    def self.totals(base, sql)
      base.rows(format(sql, qcol: base.qualified_column)).first
    end

    def self.empty(range)
      {
        snapshot: nil,
        range: range,
        kpis: {
          leads: { value: 0, previous: nil, delta: nil },
          qualified: { value: 0, previous: nil, delta: nil },
          qualified_rate: { value: 0.0, previous: nil, delta: nil, low_sample: true },
          unique_people: 0
        },
        biggest_leak: nil
      }
    end
  end
end

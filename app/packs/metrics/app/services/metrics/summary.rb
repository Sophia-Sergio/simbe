# KPIs, deltas, biggest funnel leak and cost by channel (spec 2004 decisions 1, 2).
# The cohort is leads created in the window; "qualified" counts those that ever reached
# the agency's milestone. The previous period is the equal-length window before it, and a
# delta is null when that window has no leads. All spend in the window is divided by the
# qualified count; spend outside the window never leaks in (`date` binds).
module Metrics
  module Summary
    TOTALS_SQL = <<~SQL.freeze
      SELECT count(*) AS leads, count(f.%<qcol>s) AS qualified
      FROM leads l JOIN lead_facts f ON f.lead_id = l.id
      WHERE l.agency_id = :agency_id AND l.lead_created_at >= :from AND l.lead_created_at <= :to
    SQL

    PREVIOUS_SQL = <<~SQL.freeze
      SELECT count(*) AS leads, count(f.%<qcol>s) AS qualified
      FROM leads l JOIN lead_facts f ON f.lead_id = l.id
      WHERE l.agency_id = :agency_id AND l.lead_created_at >= :prev_from AND l.lead_created_at < :prev_to
    SQL

    SPEND_SQL = <<~SQL.freeze
      SELECT s.source, sum(s.spend_cents) AS cents
      FROM ad_spend_daily s
      WHERE s.agency_id = :agency_id AND s.date >= :from_date AND s.date <= :to_date
        AND #{Metrics::Base::PREFER_REAL_SPEND}
      GROUP BY s.source
    SQL

    PREV_SPEND_SQL = <<~SQL.freeze
      SELECT s.source, sum(s.spend_cents) AS cents
      FROM ad_spend_daily s
      WHERE s.agency_id = :agency_id AND s.date >= :prev_from_date AND s.date < :from_date
        AND #{Metrics::Base::PREFER_REAL_SPEND}
      GROUP BY s.source
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
      spend, source = spend_for(base, SPEND_SQL)
      previous_spend, = spend_for(base, PREV_SPEND_SQL, only_previous_spend(base))

      leads = current[:leads].to_i
      qualified = current[:qualified].to_i
      {
        snapshot: base.snapshot,
        range: base.range,
        spend_source: source,
        kpis: kpis(leads: leads, qualified: qualified, previous: previous,
                   spend: spend, previous_spend: previous_spend),
        biggest_leak: Metrics::Funnel.leak(Metrics::Funnel.call(agency: agency, range: base.range)[:stages]),
        cost_by_channel: cost_by_channel(agency, base.range)
      }
    end

    def self.kpis(leads:, qualified:, previous:, spend:, previous_spend:)
      previous_leads = previous[:leads].to_i
      previous_qualified = previous[:qualified].to_i
      rate = Metrics::Base.rate(qualified, leads)
      previous_rate = previous_leads.zero? ? nil : Metrics::Base.rate(previous_qualified, previous_leads)
      cost = cost_per_qualified(spend, qualified)
      previous_cost = previous_leads.zero? ? nil : cost_per_qualified(previous_spend, previous_qualified)

      {
        leads: kpi(leads, previous_leads),
        qualified: kpi(qualified, previous_qualified),
        qualified_rate: { value: rate, previous: previous_rate,
                          delta: previous_rate.nil? ? nil : (rate - previous_rate).round(1),
                          low_sample: leads < LOW_SAMPLE_LEADS },
        cost_per_qualified: { value_cents: cost, previous_cents: previous_cost,
                              delta_cents: cost && previous_cost ? cost - previous_cost : nil }
      }
    end

    def self.kpi(value, previous)
      previous = nil if previous.to_i.zero?
      { value: value, previous: previous, delta: previous.nil? ? nil : value - previous }
    end

    def self.cost_per_qualified(spend, qualified)
      return nil unless spend.to_i.positive? && qualified.to_i.positive?

      (spend.to_f / qualified).round
    end

    # Channels with a real cost per qualified (spend and ≥1 qualified), in table order.
    def self.cost_by_channel(agency, range)
      Metrics::Channels.call(agency: agency, range: range)[:rows]
             .select { |row| row[:cost_per_qualified_cents] }
             .map { |row| { channel: row[:channel], cost_per_qualified_cents: row[:cost_per_qualified_cents], flag: row[:flag] } }
    end

    def self.totals(base, sql)
      base.rows(format(sql, qcol: base.qualified_column)).first
    end

    # -> [total_cents, source_with_most_cents_or_"none"]
    def self.spend_for(base, sql, extra = {})
      rows = base.rows(sql, extra)
      total = rows.sum { |row| row[:cents].to_i }
      source = rows.max_by { |row| row[:cents].to_i }&.fetch(:source, nil) || "none"
      [ total, source ]
    end

    def self.only_previous_spend(base)
      { prev_from_date: base.window[:prev_from].in_time_zone(base.agency.timezone).to_date }
    end

    def self.empty(range)
      {
        snapshot: nil,
        range: range,
        spend_source: "none",
        kpis: {
          leads: { value: 0, previous: nil, delta: nil },
          qualified: { value: 0, previous: nil, delta: nil },
          qualified_rate: { value: 0.0, previous: nil, delta: nil, low_sample: true },
          cost_per_qualified: { value_cents: nil, previous_cents: nil, delta_cents: nil }
        },
        biggest_leak: nil,
        cost_by_channel: []
      }
    end
  end
end

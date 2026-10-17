# The channel table plus the two headline insights (spec 2004 decision 4). One row per
# normalized channel with leads in the window (docs/conventions/database.md — the aggregate
# is SQL, the agency id is a bind). `basis` is "cost" when any channel has spend and "rate"
# otherwise; `flag` marks best/worst cost (or rate) so the UI can color them.
module Metrics
  module Channels
    UNTAGGED = "(untagged)".freeze
    MIN_LEADS = 30

    PER_CHANNEL_SQL = <<~SQL.freeze
      WITH cohort AS (
        SELECT l.id AS lead_id, l.channel, l.state
        FROM leads l
        WHERE l.agency_id = :agency_id AND l.lead_created_at >= :from AND l.lead_created_at <= :to
      ),
      per_channel AS (
        SELECT c.channel AS channel, count(*) AS leads, count(f.%<qcol>s) AS qualified
        FROM cohort c JOIN lead_facts f ON f.lead_id = c.lead_id
        GROUP BY c.channel
      ),
      spend AS (
        SELECT s.channel, sum(s.spend_cents) AS cents
        FROM ad_spend_daily s
        WHERE s.agency_id = :agency_id AND s.date >= :from_date AND s.date <= :to_date
          AND #{Metrics::Base::PREFER_REAL_SPEND}
        GROUP BY s.channel
      )
      SELECT p.channel, p.leads, p.qualified, s.cents AS spend_cents
      FROM per_channel p LEFT JOIN spend s ON s.channel = p.channel
      ORDER BY p.leads DESC, p.channel ASC
    SQL

    STATES_SQL = <<~SQL.freeze
      SELECT l.state AS state, count(*) AS n
      FROM leads l
      WHERE l.agency_id = :agency_id AND l.lead_created_at >= :from AND l.lead_created_at <= :to
      GROUP BY l.state
    SQL

    # -> { rows: [...], basis: "cost"|"rate", insights: {...} }
    def self.call(agency:, range: "30d")
      base = Metrics::Base.new(agency: agency, range: range)
      return empty if base.snapshot.nil?

      base.cached("channels") { build(base) }
    end

    def self.build(base)
      rows = rows_for(base)
      basis = rows.any? { |row| row[:spend_cents].to_i.positive? } ? "cost" : "rate"
      flags = assign_flags(rows, basis)
      rows.each { |row| row[:flag] = flags[row[:channel]] }
      { rows: rows, basis: basis, insights: insights(base, rows) }
    end

    # Per-channel rows ordered by leads desc then channel asc; reused by ChannelDetail.
    def self.rows_for(base)
      sql = format(PER_CHANNEL_SQL, qcol: base.qualified_column)
      base.rows(sql).map do |row|
        spend = row[:spend_cents]&.to_i
        qualified = row[:qualified].to_i
        {
          channel: row[:channel],
          leads: row[:leads].to_i,
          qualified: qualified,
          rate: Metrics::Base.rate(qualified, row[:leads].to_i),
          spend_cents: spend,
          cost_per_qualified_cents: cost_per_qualified(spend, qualified),
          flag: nil,
          low_sample: row[:leads].to_i < MIN_LEADS
        }
      end
    end

    def self.cost_per_qualified(spend, qualified)
      return nil unless spend.to_i.positive? && qualified.to_i.positive?

      (spend.to_f / qualified).round
    end

    # best = cheapest cost (or highest rate); worst = the opposite. Only channels with spend
    # and ≥1 qualified compete on cost; the rate fallback needs at least MIN_LEADS leads,
    # scaled down for tiny agencies (Alpha has 10 leads total, so every channel qualifies).
    def self.assign_flags(rows, basis)
      candidates =
        if basis == "cost"
          rows.select { |row| row[:cost_per_qualified_cents] }
        else
          min_leads = [ MIN_LEADS, rows.sum { |row| row[:leads].to_i } / 10 ].min.clamp(1, MIN_LEADS)
          rows.select { |row| row[:leads].to_i >= min_leads }
        end
      return {} if candidates.empty?

      ranked = candidates.sort_by { |row| basis == "cost" ? row[:cost_per_qualified_cents] : -row[:rate] }
      flags = { ranked.first[:channel] => "best" }
      flags[ranked.last[:channel]] = "worst" if ranked.size >= 2 && ranked.last[:channel] != ranked.first[:channel]
      flags
    end

    def self.insights(base, rows)
      total = rows.sum { |row| row[:leads].to_i }
      unattributed = rows.find { |row| row[:channel] == "Unknown" }&.fetch(:leads, 0).to_i
      states = base.rows(STATES_SQL)
      # The oracle compares the raw share (`100 * n / total >= 1.0`), so do not use the
      # rounded rate here: a 0.96% share rounds to 1.0 but is still out of area.
      main = states.select { |row| row[:state] && (100.0 * row[:n].to_i / total) >= 1.0 }
      out_count = total - main.sum { |row| row[:n].to_i }
      {
        unattributed: { count: unattributed, pct: Metrics::Base.rate(unattributed, total) },
        out_of_area: { count: out_count, pct: Metrics::Base.rate(out_count, total),
                       main_states: main.map { |row| row[:state] }.sort }
      }
    end

    def self.empty
      {
        rows: [], basis: "rate",
        insights: { unattributed: { count: 0, pct: 0.0 },
                    out_of_area: { count: 0, pct: 0.0, main_states: [] } }
      }
    end
  end
end

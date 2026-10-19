# The channel table plus the two headline insights (spec 2004 decision 4). One row per
# normalized channel with leads in the window (docs/conventions/database.md — the aggregate
# is SQL, the agency id is a bind). `flag` marks the best/worst qualified rate so the UI can
# color them. The exports carry no ad spend, so channels are compared on leads and rate only.
module Metrics
  module Channels
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
      )
      SELECT p.channel, p.leads, p.qualified
      FROM per_channel p
      ORDER BY p.leads DESC, p.channel ASC
    SQL

    STATES_SQL = <<~SQL.freeze
      SELECT l.state AS state, count(*) AS n
      FROM leads l
      WHERE l.agency_id = :agency_id AND l.lead_created_at >= :from AND l.lead_created_at <= :to
      GROUP BY l.state
    SQL

    # -> { rows: [...], insights: {...} }
    def self.call(agency:, range: "30d")
      base = Metrics::Base.new(agency: agency, range: range)
      return empty if base.snapshot.nil?

      base.cached("channels") { build(base) }
    end

    def self.build(base)
      rows = rows_for(base)
      flags = assign_flags(rows)
      rows.each { |row| row[:flag] = flags[row[:channel]] }
      { rows: rows, insights: insights(base, rows) }
    end

    # Per-channel rows ordered by leads desc then channel asc; reused by ChannelDetail.
    def self.rows_for(base)
      sql = format(PER_CHANNEL_SQL, qcol: base.qualified_column)
      base.rows(sql).map do |row|
        qualified = row[:qualified].to_i
        {
          channel: row[:channel],
          leads: row[:leads].to_i,
          qualified: qualified,
          rate: Metrics::Base.rate(qualified, row[:leads].to_i),
          flag: nil,
          low_sample: row[:leads].to_i < MIN_LEADS
        }
      end
    end

    # best = highest qualified rate; worst = the lowest. Ties go to the channel with more
    # leads (it matters more). "Unknown" is not a channel an agency can act on, so it never
    # competes (the unattributed insight covers it). A channel needs at least MIN_LEADS
    # leads to compete, scaled down for tiny agencies (Alpha has 10 leads total, so every
    # channel qualifies).
    def self.assign_flags(rows)
      min_leads = [ MIN_LEADS, rows.sum { |row| row[:leads].to_i } / 10 ].min.clamp(1, MIN_LEADS)
      candidates = rows.select { |row| row[:channel] != "Unknown" && row[:leads].to_i >= min_leads }
      return {} if candidates.empty?

      best = candidates.max_by { |row| [ row[:rate], row[:leads] ] }
      worst = candidates.min_by { |row| [ row[:rate], -row[:leads] ] }
      flags = { best[:channel] => "best" }
      flags[worst[:channel]] = "worst" unless worst[:channel] == best[:channel]
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
        rows: [],
        insights: { unattributed: { count: 0, pct: 0.0 },
                    out_of_area: { count: 0, pct: 0.0, main_states: [] } }
      }
    end
  end
end

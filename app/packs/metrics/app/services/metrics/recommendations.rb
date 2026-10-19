# Deterministic recommended actions (spec 2004 decision 7): no LLM, just rules over the
# funnel and channels, ranked by leads affected and capped at four. "Ask why" only hands
# the card's question to the agent. Routes match the frontend's client routes.
module Metrics
  module Recommendations
    MAX = 4
    FUNNEL_CTA = { label: "Open funnel", route: "/funnel" }.freeze
    CHANNELS_CTA = { label: "Open channels", route: "/channels" }.freeze
    PIPELINE_CTA = { label: "Open pipeline", route: "/pipeline" }.freeze

    NO_SHOWS_SQL = <<~SQL.freeze
      WITH cohort AS (
        SELECT l.id AS lead_id FROM leads l
        WHERE l.agency_id = :agency_id AND l.lead_created_at >= :from AND l.lead_created_at <= :to
      ),
      latest AS (
        SELECT a.lead_id, a.status,
               row_number() OVER (PARTITION BY a.lead_id ORDER BY a.booked_at DESC) AS rn
        FROM appointments a JOIN cohort c ON c.lead_id = a.lead_id
      )
      SELECT
        count(*) FILTER (WHERE rn = 1 AND status IN ('scheduled', 'attended', 'no_show')) AS scheduled,
        count(*) FILTER (WHERE rn = 1 AND status = 'no_show') AS no_shows
      FROM latest
    SQL

    COORDINATORS_SQL = <<~SQL.freeze
      SELECT l.coordinator_name AS coordinator, count(*) AS n
      FROM leads l
      WHERE l.agency_id = :agency_id AND l.lead_created_at >= :from AND l.lead_created_at <= :to
      GROUP BY l.coordinator_name
    SQL

    # -> up to four cards, each { id:, area:, impact:, title:, why:, cta:, ask:, score: },
    # most impactful first. An agency without a snapshot gets no recommendations.
    def self.call(agency:, range: "30d")
      base = Metrics::Base.new(agency: agency, range: range)
      return [] if base.snapshot.nil?

      base.cached("recommendations") { rank(build(base)) }
    end

    def self.rank(cards)
      cards.sort_by { |card| [ -card[:score], card[:id] ] }.first(MAX)
    end

    def self.build(base)
      funnel = Metrics::Funnel.call(agency: base.agency, range: base.range)
      channels = Metrics::Channels.call(agency: base.agency, range: base.range)
      [
        funnel_leak(funnel),
        best_vs_worst(channels[:rows]),
        unattributed(channels[:insights][:unattributed]),
        no_shows(base),
        coordinator_load(base)
      ].compact
    end

    def self.funnel_leak(funnel)
      leak = Metrics::Funnel.leak(funnel[:stages])
      return nil if leak.nil? || funnel[:total].to_i.zero?

      {
        id: "funnel_leak", area: "process",
        impact: "#{leak[:lost]} leads stalled",
        title: "Most leads stall before #{leak[:to_stage]}",
        why: "#{leak[:pct_lost]}% of leads never reach #{leak[:to_stage]} - the largest drop in your funnel.",
        cta: FUNNEL_CTA,
        ask: { question: "Why do leads stall before the application and what should we change?" },
        score: leak[:lost].to_i
      }
    end

    def self.best_vs_worst(rows)
      best = rows.find { |row| row[:flag] == "best" }
      worst = rows.find { |row| row[:flag] == "worst" }
      return nil unless best && worst

      {
        id: "best_vs_worst_channel", area: "ads",
        impact: "#{worst[:leads]} leads on #{worst[:channel]}",
        title: "#{worst[:channel]} has your lowest qualified rate",
        why: "#{best[:channel]} turns more of its leads into qualified ones than #{worst[:channel]} does.",
        cta: CHANNELS_CTA,
        ask: { question: "Why does #{worst[:channel]} convert worse than #{best[:channel]}?" },
        score: worst[:leads].to_i
      }
    end

    def self.unattributed(insight)
      return nil if insight[:pct].to_f < 15.0

      {
        id: "unattributed", area: "ads",
        impact: "#{insight[:count]} leads with no source",
        title: "#{percent(insight[:pct])}% of leads have no channel",
        why: "#{insight[:count]} leads arrived without a channel tag, so their results cannot be compared by channel.",
        cta: CHANNELS_CTA,
        ask: { question: "What can we do about leads with no channel tag?" },
        score: insight[:count].to_i
      }
    end

    def self.no_shows(base)
      row = base.rows(NO_SHOWS_SQL).first
      scheduled = row[:scheduled].to_i
      missed = row[:no_shows].to_i
      return nil if scheduled.zero?

      rate = Metrics::Base.rate(missed, scheduled)
      return nil if rate < 10.0

      {
        id: "no_shows", area: "process",
        impact: "#{missed} #{'consult'.pluralize(missed)} to rebook",
        title: missed == 1 ? "#{missed} consult was missed and not rebooked" : "#{missed} consults were missed and not rebooked",
        why: "#{percent(rate)}% of consult appointments were no-shows.",
        cta: PIPELINE_CTA,
        ask: { question: "Why are consults being no-shows and who should I rebook first?" },
        score: missed
      }
    end

    def self.coordinator_load(base)
      rows = base.rows(COORDINATORS_SQL)
      total = rows.sum { |row| row[:n].to_i }
      top = rows.select { |row| row[:coordinator] }.max_by { |row| row[:n].to_i }
      return nil if top.nil? || total.zero?

      share = Metrics::Base.rate(top[:n].to_i, total)
      return nil if share <= 50.0

      {
        id: "coordinator_load", area: "people",
        impact: "#{top[:n]} leads with #{top[:coordinator]}",
        title: "#{top[:coordinator]} handles most of your leads",
        why: "#{percent(share)}% of leads sit with #{top[:coordinator]}; the load is unbalanced.",
        cta: PIPELINE_CTA,
        ask: { question: "How do we rebalance leads away from #{top[:coordinator]}?" },
        score: top[:n].to_i
      }
    end

    # "25.0" -> "25", "33.3" -> "33.3" (the card copy reads better without a trailing .0).
    def self.percent(value)
      value.to_f % 1 == 0 ? value.to_i.to_s : value.to_s
    end
  end
end

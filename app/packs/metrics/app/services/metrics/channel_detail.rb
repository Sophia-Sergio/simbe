# One channel with its campaign breakdown (spec 2004 decision 5). The channel's own KPIs
# come from Metrics::Channels (same cohort, same window); an unknown channel — one with no
# leads in the window — raises ActiveRecord::RecordNotFound, which the controller renders
# as 404 (never 403, so a probe cannot confirm the id exists).
module Metrics
  module ChannelDetail
    UNTAGGED = "(untagged)".freeze

    CAMPAIGNS_SQL = <<~SQL.freeze
      WITH cohort AS (
        SELECT l.id AS lead_id, l.ad, coalesce(nullif(l.campaign, ''), :untagged) AS campaign
        FROM leads l
        WHERE l.agency_id = :agency_id AND l.lead_created_at >= :from AND l.lead_created_at <= :to
          AND l.channel = :channel
      ),
      per_campaign AS (
        SELECT c.campaign AS campaign, count(*) AS leads, count(f.%<qcol>s) AS qualified,
               count(DISTINCT c.ad) AS ads
        FROM cohort c JOIN lead_facts f ON f.lead_id = c.lead_id
        GROUP BY c.campaign
      ),
      spend AS (
        SELECT coalesce(nullif(campaign, ''), :untagged) AS campaign, sum(spend_cents) AS cents
        FROM ad_spend_daily
        WHERE agency_id = :agency_id AND date >= :from_date AND date <= :to_date AND channel = :channel
        GROUP BY 1
      )
      SELECT p.campaign, p.ads, p.leads, p.qualified, s.cents AS spend_cents
      FROM per_campaign p LEFT JOIN spend s ON s.campaign = p.campaign
      ORDER BY p.leads DESC, p.campaign ASC
    SQL

    # -> { channel:, kpis: {...}, campaigns: [...] }
    def self.call(agency:, range: "30d", channel:)
      base = Metrics::Base.new(agency: agency, range: range)
      row = Metrics::Channels.call(agency: agency, range: range)[:rows].find { |r| r[:channel] == channel }
      raise ActiveRecord::RecordNotFound, "unknown channel #{channel.inspect}" if row.nil?

      {
        channel: channel,
        kpis: {
          leads: row[:leads],
          qualified: row[:qualified],
          rate: row[:rate],
          spend_cents: row[:spend_cents],
          cost_per_qualified_cents: row[:cost_per_qualified_cents]
        },
        campaigns: campaigns(base, channel)
      }
    end

    def self.campaigns(base, channel)
      sql = format(CAMPAIGNS_SQL, qcol: base.qualified_column)
      base.rows(sql, channel: channel, untagged: UNTAGGED).map do |row|
        spend = row[:spend_cents]&.to_i
        qualified = row[:qualified].to_i
        {
          campaign: row[:campaign],
          ads: row[:ads].to_i,
          leads: row[:leads].to_i,
          qualified: qualified,
          rate: Metrics::Base.rate(qualified, row[:leads].to_i),
          spend_cents: spend,
          cost_per_qualified_cents: Metrics::Channels.cost_per_qualified(spend, qualified)
        }
      end
    end
  end
end

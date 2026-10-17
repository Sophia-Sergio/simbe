require "zlib"

# Deterministic placeholder ad spend (spec 2004 decision 6). The exports carry no spend,
# so until real Google/Meta connectors exist `rake spend:sample[slug]` fabricates a
# plausible daily cost for the agency's paid channels — otherwise "Cost per qualified"
# has no source. The value for a (channel, campaign, day) is seeded by the agency slug,
# so re-running replaces the agency's `sample` rows with identical numbers and never
# touches `import`/`connected` rows (docs/conventions/database.md — replace, don't
# duplicate). `ad_spend_daily` is tenant data, so `Current.agency` is set for the write
# and restored afterwards, exactly as RowsLoader does for the test loader.
module Spend
  module SampleGenerator
    # Assumed cost per lead in cents by channel; only the three paid channels get spend.
    COST_PER_LEAD_CENTS = { "Facebook" => 1800, "Instagram" => 2200, "Google" => 3000 }.freeze
    PLATFORMS = { "Facebook" => "meta", "Instagram" => "meta", "Google" => "google" }.freeze
    UNTAGGED = "(untagged)".freeze
    # Leads grouped by channel/campaign/creation day (agency time zone), paid channels only.
    LEADS_SQL = <<~SQL.freeze
      SELECT channel,
             coalesce(nullif(campaign, ''), :untagged) AS campaign,
             (lead_created_at AT TIME ZONE :timezone)::date AS date,
             count(*) AS leads
      FROM leads
      WHERE agency_id = :agency_id AND channel IN (:channels)
      GROUP BY 1, 2, 3
    SQL

    # Real (import/connected) spend, keyed by channel/campaign/day, so a placeholder day is
    # never generated beside a real one.
    REAL_SPEND_SQL = <<~SQL.freeze
      SELECT DISTINCT channel, coalesce(nullif(campaign, ''), :untagged) AS campaign, date
      FROM ad_spend_daily
      WHERE agency_id = :agency_id AND source <> 'sample'
    SQL

    # -> Integer number of sample rows written.
    def self.call(agency:)
      previous = Current.agency
      Current.agency = agency
      groups = uncovered_groups(agency)
      ActiveRecord::Base.transaction do
        AdSpendDay.where(source: "sample").delete_all
        groups.each { |group| AdSpendDay.create!(attributes(agency, group)) }
      end
      groups.size
    ensure
      Current.agency = previous
    end

    # The paid (channel, campaign, day) combos with leads but no real spend yet: a day an
    # owner imported (or a connector filled) keeps its real row and gets no placeholder
    # beside it — which the unique index would reject regardless, and the SUMs would double
    # count.
    def self.uncovered_groups(agency)
      covered = covered_keys(agency)
      groups_for(agency).reject do |group|
        covered.include?([ group["channel"], group["campaign"], group["date"].to_date ])
      end
    end

    def self.covered_keys(agency)
      rows(REAL_SPEND_SQL, agency_id: agency.id, untagged: UNTAGGED).each_with_object({}) do |row, index|
        index[[ row["channel"], row["campaign"], row["date"].to_date ]] = true
      end
    end

    def self.groups_for(agency)
      rows(LEADS_SQL, agency_id: agency.id, timezone: agency.timezone,
                    untagged: UNTAGGED, channels: COST_PER_LEAD_CENTS.keys)
    end

    def self.rows(sql, **binds)
      statement = ActiveRecord::Base.sanitize_sql_array([ sql, binds ])
      ActiveRecord::Base.connection.select_all(statement, "Spend::SampleGenerator").to_a
    end

    def self.attributes(agency, group)
      channel = group["channel"]
      campaign = group["campaign"]
      date = group["date"].to_date
      leads = group["leads"].to_i
      {
        agency_id: agency.id,
        date: date,
        platform: PLATFORMS.fetch(channel),
        channel: channel,
        campaign: campaign,
        spend_cents: spend_cents(agency.slug, channel, campaign, date, leads),
        source: "sample"
      }
    end

    # leads × assumed cost per lead × a 0.85–1.15 jitter, seeded so the same
    # agency/channel/campaign/day always produces the same cents.
    def self.spend_cents(slug, channel, campaign, date, leads)
      random = Random.new(Zlib.crc32("#{slug}-#{channel}-#{campaign}-#{date}"))
      (leads * COST_PER_LEAD_CENTS.fetch(channel) * (0.85 + 0.3 * random.rand)).round
    end
  end
end

# Shared foundation for every Metrics query (spec 2004, decisions 1, 2, 10, 11):
# range windows measured back from the snapshot's `as_of` (never wall-clock), the
# qualified-column whitelist, bind-parameter SQL, and per-(agency, snapshot, milestone,
# range, endpoint) caching. The agency id is always a bind, never interpolated
# (docs/conventions/multi-tenancy.md) and the qualified column can only come from the
# whitelist, never from input. Child classes own one question each and take `agency:`.
module Metrics
  class Base
    RANGES = { "30d" => 30.days, "90d" => 90.days, "12m" => 365.days }.freeze
    # Aliased from W0-3 (agencies.qualified_milestone -> lead_facts column), so the
    # whitelist lives in one place (lane override 2).
    QUALIFIED_COLUMNS = AgencyMilestones::COLUMNS

    # Raw SQL, so the metrics pack never names the ingest pack's Snapshot model: there is
    # no metrics->ingest edge in config/boundaries_allowlist.yml, and that list only shrinks.
    SNAPSHOT_SQL = <<~SQL.freeze
      SELECT id, as_of FROM snapshots
      WHERE agency_id = :agency_id
      ORDER BY created_at DESC
      LIMIT 1
    SQL

    attr_reader :agency, :range

    def initialize(agency:, range: "30d")
      @agency = agency
      @range = range.to_s
      raise BadRange, "range must be one of #{RANGES.keys.join(', ')}" unless RANGES.key?(@range)
    end

    # The agency's current snapshot as `{ id:, as_of: }`, or nil when it has never loaded
    # one. "Current" is the most recently LOADED snapshot (as in Leads::Queues), so
    # re-loading an older export still replaces the numbers.
    def snapshot
      return @snapshot if defined?(@snapshot)

      row = connection.select_one(sanitize(SNAPSHOT_SQL, agency_id: agency.id))
      @snapshot = row && { id: row["id"], as_of: row["as_of"] }
    end

    # The cohort window as UTC times, or nil without a snapshot: the current window is
    # `>= from AND <= to`; the previous equal-length window is `>= prev_from AND < from`.
    def window
      return nil unless snapshot

      length = RANGES.fetch(range)
      to = snapshot[:as_of]
      from = to - length
      { from: from, to: to, prev_from: from - length, prev_to: from }
    end

    # The lead_facts column that records the agency's qualified milestone (whitelist only).
    def qualified_column
      QUALIFIED_COLUMNS.fetch(agency.qualified_milestone)
    end

    # Runs `sql` with the window binds (plus any `extra`) and returns symbolized rows.
    # Unused binds are harmless; `sanitize_sql_array` only substitutes the names it finds.
    def rows(sql, extra = {})
      bind = {
        agency_id: agency.id,
        from: window[:from], to: window[:to],
        prev_from: window[:prev_from], prev_to: window[:prev_to],
        from_date: local_date(window[:from]), to_date: local_date(window[:to])
      }.merge(extra)
      connection.select_all(sanitize(sql, bind), "Metrics").to_a.map(&:symbolize_keys)
    end

    # Cached per (agency, snapshot, milestone, range, key). A definition change lands on the
    # very next call because the milestone is part of the key (spec 2004 decision 8).
    def cached(key, &block)
      Rails.cache.fetch(cache_key(key), &block)
    end

    # Percent with one decimal, 0.0 when the denominator is zero (never divide by zero).
    def self.rate(numerator, denominator)
      denominator.to_i.zero? ? 0.0 : (100.0 * numerator / denominator).round(1)
    end

    private

    def cache_key(key)
      [ "metrics", agency.id, snapshot&.dig(:id), agency.qualified_milestone, range, key ]
    end

    # A date in the agency's time zone, for the `date` column of ad_spend_daily.
    def local_date(time)
      time.in_time_zone(agency.timezone).to_date
    end

    def sanitize(sql, binds)
      ActiveRecord::Base.sanitize_sql_array([ sql, binds ])
    end

    def connection
      ActiveRecord::Base.connection
    end
  end
end

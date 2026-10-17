# Shared foundation for every Metrics query (spec 2004, decisions 1, 2, 10, 11):
# range windows measured back from the snapshot's `as_of` (never wall-clock), the
# qualified-column whitelist, bind-parameter SQL, and per-(agency, snapshot, milestone,
# range, endpoint) caching. The agency id is always a bind, never interpolated
# (docs/conventions/multi-tenancy.md) and the qualified column can only come from the
# whitelist, never from input. Child classes own one question each and take `agency:`.
module Metrics
  class Base
    # Day counts, not Durations: the window is built from calendar dates in the agency's zone.
    RANGES = { "30d" => 30, "90d" => 90, "12m" => 365 }.freeze
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

    # (row count, latest update) of the agency's ad spend: goes into the cache key, so a
    # changed spend total (a fresh sample run, an import) is never served from a stale
    # summary/channels payload.
    SPEND_FINGERPRINT_SQL = <<~SQL.freeze
      SELECT count(*) AS count, max(updated_at) AS updated_at
      FROM ad_spend_daily
      WHERE agency_id = :agency_id
    SQL

    # Predicate that drops a `sample` placeholder when a real (import/connected) row exists
    # for the same agency/channel/day, so the placeholder never double counts real spend in
    # the SUMs. The outer ad_spend_daily relation must be aliased `s`.
    PREFER_REAL_SPEND = <<~SQL.squish.freeze
      (s.source <> 'sample' OR NOT EXISTS (
        SELECT 1 FROM ad_spend_daily r
        WHERE r.agency_id = s.agency_id AND r.channel = s.channel
          AND r.date = s.date AND r.source <> 'sample'
      ))
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
      @snapshot = row && { id: row["id"], as_of: row["as_of"].utc }
    end

    # The cohort window as UTC times, or nil without a snapshot: it spans whole calendar
    # days in the agency's time zone, ending on the as_of's local day, so the lead cohort
    # and the (date-based) ad spend cover exactly the same days. The previous window is the
    # equal-length run of local days immediately before it.
    def window
      return nil unless snapshot

      zone = ActiveSupport::TimeZone[agency.timezone]
      length = RANGES.fetch(range)
      to_date = snapshot[:as_of].in_time_zone(zone).to_date
      from_date = to_date - (length - 1)
      {
        from: local_day(zone, from_date), to: local_day(zone, to_date).end_of_day,
        prev_from: local_day(zone, from_date - length), prev_to: local_day(zone, from_date - 1).end_of_day,
        from_date: from_date, to_date: to_date,
        prev_from_date: from_date - length, prev_to_date: from_date - 1
      }
    end

    # The lead_facts column that records the agency's qualified milestone (whitelist only).
    def qualified_column
      QUALIFIED_COLUMNS.fetch(agency.qualified_milestone)
    end

    # Runs `sql` with the window binds (plus any `extra`) and returns symbolized rows.
    # Unused binds are harmless; `sanitize_sql_array` only substitutes the names it finds.
    def rows(sql, extra = {})
      bounds = window
      bind = {
        agency_id: agency.id,
        from: bounds[:from], to: bounds[:to],
        prev_from: bounds[:prev_from], prev_to: bounds[:prev_to],
        from_date: bounds[:from_date], to_date: bounds[:to_date],
        prev_from_date: bounds[:prev_from_date], prev_to_date: bounds[:prev_to_date]
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
      [ "metrics", agency.id, snapshot&.dig(:id), agency.qualified_milestone, range, key, spend_fingerprint ]
    end

    # `"<row_count>:<max updated_at>"`, e.g. "3:2026-09-25T20:00:00.123456Z". A String, not a
    # Time: cache-key expansion (`to_param`) would drop sub-second precision and miss a
    # same-second replacement.
    def spend_fingerprint
      row = connection.select_one(sanitize(SPEND_FINGERPRINT_SQL, agency_id: agency.id))
      "#{row['count'].to_i}:#{row['updated_at']&.utc&.iso8601(6)}"
    end

    # A whole calendar day in the agency's time zone (midnight local), as a UTC instant.
    def local_day(zone, date)
      zone.local(date.year, date.month, date.day)
    end

    def sanitize(sql, binds)
      ActiveRecord::Base.sanitize_sql_array([ sql, binds ])
    end

    def connection
      ActiveRecord::Base.connection
    end
  end
end

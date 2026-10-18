# Snapshot::Dedupe knows which rows of an export are the same row. Two rows are the same when they
# share their table's natural key (the key the database's unique index enforces), and only the
# first one is kept: the Validator reports how many were dropped per file, and the Importer skips
# them, so the report and the loaded data always agree.
#
# Keys are built from the typed values of Snapshot::Reader (Time, not text), so the same instant
# written two ways is still the same key.
class Snapshot
  module Dedupe
    # Natural keys, unique per agency (spec 2002 decision 2). Rows are linked by `:external_id`.
    NATURAL_KEYS = {
      leads: %i[external_id],
      stage_events: %i[external_id stage],
      contacts: %i[external_id contacted_at direction channel],
      screener_answers: %i[external_id question],
      web_sessions: %i[external_id started_at],
      appointments: %i[external_id booked_at],
      applications: %i[external_id started_at]
    }.freeze

    def self.key(table, row)
      NATURAL_KEYS.fetch(table).map { |column| row[column] }
    end

    # A stateful filter for one table: `keep?(row)` is true the first time a key is seen and false
    # for every later row with the same key (`dropped` counts those).
    class Filter
      attr_reader :dropped

      def initialize(table)
        @table = table
        @seen = {}
        @dropped = 0
      end

      def keep?(row)
        key = Dedupe.key(@table, row)
        if @seen.key?(key)
          @dropped += 1
          false
        else
          @seen[key] = true
        end
      end
    end

    # { table => number of rows dropped } for the tables that had any.
    def self.dropped_counts(rows)
      NATURAL_KEYS.each_key.with_object({}) do |table, counts|
        filter = Filter.new(table)
        rows[table].each { |row| filter.keep?(row) }
        counts[table] = filter.dropped if filter.dropped.positive?
      end
    end
  end
end

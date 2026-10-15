# Snapshot::AsOf computes the snapshot's `as_of` from typed rows (Snapshot::Rows or the
# ExportBuilder#rows shape): the latest *event* timestamp in the files.
#
# Event timestamps only — created, stage entered, contacted, submitted, started, booked,
# outcome updated. `scheduled_for` and `paused_until` are future-dated by nature and are
# deliberately excluded (docs/conventions/real-data.md rule 3, spec 2002 decision 5).
class Snapshot
  module AsOf
    EVENT_COLUMNS = {
      leads: %i[created_at outcome_updated_at],
      stage_events: %i[entered_at],
      contacts: %i[contacted_at],
      screener_answers: %i[submitted_at],
      web_sessions: %i[started_at],
      appointments: %i[booked_at],
      applications: %i[started_at submitted_at]
    }.freeze

    # -> Time (UTC) | nil. Full precision and never clamped to the clock (as_of must not depend
    # on when the import ran); the oracle truncates only when printing
    # (docs/conventions/real-data.md rule 3), so callers compare `as_of.change(usec: 0)`.
    def self.call(rows)
      EVENT_COLUMNS.flat_map do |table, columns|
        rows[table].flat_map { |row| columns.filter_map { |column| row[column] } }
      end.max
    end
  end
end

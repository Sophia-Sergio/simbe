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

    # -> Time (UTC) | nil. Truncated to the second because spec 2002 decision 5 and
    # docs/conventions/real-data.md quote as_of at whole seconds (Harbor 2026-10-01T05:26:42Z);
    # the exports carry sub-second noise. Never later than now, so a future-dated import
    # cannot move as_of.
    def self.call(rows)
      latest = EVENT_COLUMNS.flat_map do |table, columns|
        rows[table].flat_map { |row| columns.filter_map { |column| row[column] } }
      end.max
      latest && [ latest.change(usec: 0), Time.current ].min
    end
  end
end

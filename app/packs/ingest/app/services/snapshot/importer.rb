require "csv"

class Snapshot
  # Raised when another load for the same agency holds the advisory lock.
  class InProgress < StandardError; end

  # Raised when the upload's report has blocking errors; carries the report.
  class Invalid < StandardError
    attr_reader :report

    def initialize(report)
      @report = report
      super("snapshot has validation errors")
    end
  end

  # Raised when the upload is cancelled while its import is running.
  class Cancelled < StandardError; end

  # Replaces an agency's data with an export directory in ONE transaction (docs/conventions/
  # database.md, spec 2002 decision 8): advisory lock per agency → delete the agency's leads
  # (children cascade) → stream every table in → Snapshot::Facts → snapshots row. A failure rolls
  # back to the previous snapshot and a reload never double counts.
  #
  # Rows are streamed table by table with Postgres `COPY` (lane override 6): a 69 MB Lakeside
  # export must load in under 120 s, and `insert_all` costs roughly 0.5 ms per row here, which
  # would not fit. Screener answers are encrypted per row before they reach the COPY stream
  # (docs/conventions/sensitive-data.md) and are the only per-row cost.
  #
  # `unscoped` is used deliberately (this and the Validator are the only places) to replace THIS
  # agency's rows; every statement is bound to the agency id. `cancel:` is polled between batches
  # so a cancelled upload aborts; `progress:` (Snapshot::Progress) advances as batches land.
  module Importer
    # Aliases so callers can reach the error classes through the autoloadable Importer (Zeitwerk
    # maps Snapshot::Importer to this file, never Snapshot::InProgress to one of its own).
    InProgress = Snapshot::InProgress
    Invalid = Snapshot::Invalid
    Cancelled = Snapshot::Cancelled

    BATCH = 5_000
    # put_copy_data is flushed in bounded chunks: a single ~1 MB buffer trips the driver
    # ("no COPY in progress"), so the stream is flushed well under that.
    FLUSH_BYTES = 256 * 1024

    TABLES = %i[
      leads stage_events contacts screener_answers web_sessions appointments applications
    ].freeze
    CHILD_TABLES = TABLES.drop(1).freeze

    # COPY column order per table (ids use the DB default). created_at/updated_at are NOT NULL
    # with no DB default, so they are written explicitly.
    COPY_COLUMNS = {
      leads: %w[
        agency_id external_id lead_created_at first_name last_name email phone state source_raw
        channel campaign ad coordinator_name current_stage outcome outcome_reason
        outcome_updated_at paused_until created_at updated_at
      ],
      stage_events: %w[agency_id lead_id stage entered_at created_at updated_at],
      contacts: %w[agency_id lead_id contacted_at direction channel contacted_by created_at updated_at],
      screener_answers: %w[agency_id lead_id submitted_at question answer meets_requirement created_at updated_at],
      web_sessions: %w[agency_id lead_id started_at landing_url pages_viewed referrer device created_at updated_at],
      appointments: %w[agency_id lead_id booked_at scheduled_for status created_at updated_at],
      applications: %w[agency_id lead_id started_at submitted_at percent_complete last_section_completed created_at updated_at]
    }.freeze

    # -> Snapshot. Raises InProgress, Invalid(report) or Cancelled.
    def self.call(agency:, dir:, user: nil, progress: nil, cancel: nil)
      previous = Current.agency
      Current.agency = agency

      rows = Reader.call(dir)
      report = Validator.call(agency: agency, dir: dir, rows: rows)
      raise Invalid.new(report) unless report[:ok]

      snapshot = nil
      ActiveRecord::Base.transaction do
        raise InProgress unless try_lock(agency)

        replace!(agency, rows, progress: progress, cancel: cancel)
        progress&.update(phase: "computing", pct: 95)
        Facts.call(agency.id)
        snapshot = Snapshot.create!(
          agency: agency,
          as_of: report[:as_of] || AsOf.call(rows),
          row_counts: row_counts(rows),
          warnings: report[:warnings],
          loaded_by: user&.id,
          loaded_at: Time.current
        )
      end
      snapshot
    ensure
      Current.agency = previous
    end

    # A 60-bit bigint from the agency UUID; the same agency always maps to the same lock.
    def self.lock_key(agency)
      agency.id.to_s.delete("-")[0, 15].to_i(16)
    end

    # Transaction-scoped advisory lock: released when the import transaction ends.
    def self.try_lock(agency)
      connection.select_value("SELECT pg_try_advisory_xact_lock(#{lock_key(agency)})")
    end

    def self.replace!(agency, rows, progress: nil, cancel: nil)
      Lead.unscoped.where(agency_id: agency.id).delete_all
      now = Time.current
      step = tracker(progress, TABLES.sum { |table| rows[table].size })

      copy_table(:leads, rows[:leads], agency, {}, now, step, cancel)
      lead_ids = Lead.unscoped.where(agency_id: agency.id).pluck(:external_id, :id).to_h
      CHILD_TABLES.each { |table| copy_table(table, rows[table], agency, lead_ids, now, step, cancel) }
    end

    # Streams one table into Postgres with COPY, one COPY per 5,000-row batch. Keeping the COPY
    # statements short lets the cancel check and the progress write run between them (a progress
    # write during an open COPY is not possible on the same connection), while the COPY buffer is
    # still flushed in bounded chunks. An exception inside a COPY (a cancel, a constraint) aborts
    # that stream cleanly, so the surrounding transaction can roll back.
    def self.copy_table(table, rows, agency, lead_ids, now, step, cancel)
      return if rows.empty?

      raw = connection.raw_connection
      sql = "COPY #{table} (#{COPY_COLUMNS.fetch(table).join(', ')}) FROM STDIN WITH (FORMAT csv)"
      each_batch(rows, step, cancel) do |batch|
        raw.copy_data(sql) do
          buffer = +""
          batch.each do |row|
            buffer << CSV.generate_line(row_values(table, row, agency, lead_ids, now))
            next if buffer.bytesize < FLUSH_BYTES

            raw.put_copy_data(buffer)
            buffer.clear
          end
          raw.put_copy_data(buffer) unless buffer.empty?
        end
      end
    end

    # Values aligned with COPY_COLUMNS. nil is written as an empty field → NULL; Time/Date are
    # ISO-8601 so Postgres parses them without a cast.
    def self.row_values(table, row, agency, lead_ids, now)
      case table
      when :leads
        [ agency.id, row[:external_id], stamp(row[:created_at]), row[:first_name], row[:last_name],
          row[:email], row[:phone], row[:state], row[:source],
          Channels::Normalizer.call(row[:source]).first,
          row[:campaign], row[:ad], row[:coordinator], row[:current_stage], row[:outcome],
          row[:outcome_reason], stamp(row[:outcome_updated_at]), row[:paused_until]&.iso8601,
          stamp(now), stamp(now) ]
      when :stage_events
        [ agency.id, lead_ids.fetch(row[:external_id]), row[:stage], stamp(row[:entered_at]),
          stamp(now), stamp(now) ]
      when :contacts
        [ agency.id, lead_ids.fetch(row[:external_id]), stamp(row[:contacted_at]), row[:direction],
          row[:channel], row[:contacted_by], stamp(now), stamp(now) ]
      when :screener_answers
        [ agency.id, lead_ids.fetch(row[:external_id]), stamp(row[:submitted_at]), row[:question],
          encrypted_answer(row[:answer]), row[:meets_requirement], stamp(now), stamp(now) ]
      when :web_sessions
        [ agency.id, lead_ids.fetch(row[:external_id]), stamp(row[:started_at]), row[:landing_url],
          row[:pages_viewed], row[:referrer], row[:device], stamp(now), stamp(now) ]
      when :appointments
        [ agency.id, lead_ids.fetch(row[:external_id]), stamp(row[:booked_at]), stamp(row[:scheduled_for]),
          row[:status], stamp(now), stamp(now) ]
      when :applications
        [ agency.id, lead_ids.fetch(row[:external_id]), stamp(row[:started_at]), stamp(row[:submitted_at]),
          row[:percent_complete], row[:last_section_completed], stamp(now), stamp(now) ]
      end
    end

    def self.stamp(time)
      time&.utc&.iso8601(6)
    end

    # The attribute type serializes the plaintext into the same envelope `encrypts :answer` reads,
    # so health data is never stored in the clear (verified by the schema spec).
    def self.encrypted_answer(value)
      return nil if value.nil?

      ScreenerAnswer.type_for_attribute("answer").serialize(value)
    end

    def self.each_batch(rows, step, cancel)
      rows.each_slice(BATCH) do |batch|
        raise Cancelled if cancel&.call

        yield batch
        step.call(batch.size)
      end
    end

    # Lazily reports import progress; total is the row count across all seven tables.
    def self.tracker(progress, total)
      done = 0
      lambda do |count|
        done += count
        next unless progress

        pct = total.positive? ? [ (done * 100) / total, 100 ].min : 100
        progress.update(phase: "importing", pct: pct, rows_done: done, rows_total: total)
      end
    end

    def self.row_counts(rows)
      TABLES.index_with { |table| rows[table].size }.transform_keys(&:to_s)
    end

    def self.connection
      ActiveRecord::Base.connection
    end
  end
end

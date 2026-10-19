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
  # Rows are streamed file by file and table by table straight into Postgres `COPY` (lane override
  # 6): a 69 MB Lakeside export must load in under 120 s. Holding a whole export as arrays costs
  # far more than the parse itself — GC pressure roughly quintuples the per-row encryption — so
  # only one 5,000-row batch is ever in memory. Screener answers are encrypted per row before they
  # reach the COPY stream (docs/conventions/sensitive-data.md) and are the only per-row cost.
  #
  # `unscoped` is used deliberately (this and the Validator are the only places) to replace THIS
  # agency's rows; every statement is bound to the agency id. `cancel:` is polled between batches so
  # a cancelled upload aborts; `progress:` (Snapshot::Progress) advances as batches land.
  module Importer
    # Aliases so callers can reach the error classes through the autoloadable Importer (Zeitwerk
    # maps Snapshot::Importer to this file, never Snapshot::InProgress to one of its own).
    InProgress = Snapshot::InProgress
    Invalid = Snapshot::Invalid
    Cancelled = Snapshot::Cancelled

    BATCH = 5_000
    # put_copy_data is flushed in bounded chunks (a single ~1 MB buffer trips the driver).
    FLUSH_BYTES = 256 * 1024

    # Every table the import loads. After a load, `ANALYZE` gives the planner fresh statistics so
    # the NEXT replace's cascaded FK triggers use the child indexes instead of seq-scanning a
    # bulk-loaded table whose stats still say 0 rows (autovacuum may not have run yet).
    ANALYZE_TABLES = %w[
      leads people stage_events contacts screener_answers web_sessions appointments applications lead_facts
    ].freeze

    # COPY column order per table (ids use the DB default). created_at/updated_at are NOT NULL
    # with no DB default, so they are written explicitly.
    COPY_COLUMNS = {
      leads: %w[
        agency_id person_id external_id lead_created_at first_name last_name email phone state source_raw
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
    # `report:` is the already-stored validation report (the upload job passes it, so the files are
    # not parsed for validation a second time); without it the files are validated here (rake task).
    def self.call(agency:, dir:, user: nil, report: nil, progress: nil, cancel: nil)
      previous = Current.agency
      Current.agency = agency

      report = symbolize(report) if report
      # A stored report always carries the diff; anything less (an old row, a hand-built one) is
      # re-validated rather than trusted.
      report = validate!(agency, dir) unless report&.key?(:diff)

      snapshot = nil
      ActiveRecord::Base.transaction do
        raise InProgress unless try_lock(agency)

        # A first big load may predate any stats: without them the cascade below seq-scans the
        # child tables (minutes), so analyze anything never analyzed before the delete.
        analyze_unanalyzed_tables
        # Replacing a snapshot: the previous leads (children cascade) go first.
        Lead.unscoped.where(agency_id: agency.id).delete_all
        Person.unscoped.where(agency_id: agency.id).delete_all
        stream!(agency, dir, report, progress, cancel)
        progress&.update(phase: "computing", pct: 95)
        # Facts.call and the ANALYZE below can run without a progress write; keep the heartbeat
        # fresh so ExpireUploadsJob never fails a healthy upload.
        progress&.heartbeat
        Facts.call(agency.id)
        progress&.heartbeat
        # Leave stats behind so the next replace's FK triggers get index plans (see ANALYZE_TABLES).
        analyze_loaded_tables
        snapshot = Snapshot.create!(
          agency: agency,
          as_of: report[:as_of],
          row_counts: row_counts(report),
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
      connection.select_value("SELECT pg_try_advisory_xact_lock($1)", "Snapshot::Importer Lock",
                              [ bind("key", lock_key(agency)) ])
    end

    def self.bind(name, value)
      ActiveRecord::Relation::QueryAttribute.new(name, value, ActiveRecord::Type::BigInteger.new)
    end

    # Reader + Validator over the directory; raises Invalid (carrying the report) on any error.
    def self.validate!(agency, dir)
      rows = Reader.call(dir)
      report = Validator.call(agency: agency, dir: dir, rows: rows)
      raise Invalid.new(report) unless report[:ok]

      report
    end

    # `ANALYZE` every table the import loaded: inside a transaction it is cheap (it samples and
    # only writes planner statistics) and it leaves the next replace's FK cascade with fresh
    # numbers.
    def self.analyze_loaded_tables
      ANALYZE_TABLES.each { |table| analyze(table) }
    end

    # Analyze only the tables the planner has never seen (a load that came from the rake task or a
    # restore), so the replace's cascaded FK triggers get index plans.
    def self.analyze_unanalyzed_tables
      ANALYZE_TABLES.reject { |table| analyzed?(table) }.each { |table| analyze(table) }
    end

    def self.analyze(table)
      connection.execute("ANALYZE #{connection.quote_table_name(table)}")
    end

    # true once any ANALYZE (manual or autovacuum) has ever run on the table.
    def self.analyzed?(table)
      value = connection.select_value(
        "SELECT (last_analyze IS NOT NULL OR last_autoanalyze IS NOT NULL) FROM pg_stat_user_tables WHERE relname = $1",
        "Snapshot::Importer Stats", [ bind_string("relname", table) ]
      )
      value == true || value == "t"
    end

    def self.bind_string(name, value)
      ActiveRecord::Relation::QueryAttribute.new(name, value, ActiveRecord::Type::String.new)
    end

    # Streams each export file into its table, lead_id-ordered, one 5,000-row batch at a time.
    def self.stream!(agency, dir, report, progress, cancel)
      step = tracker(progress, total_rows(report))
      now = Time.current
      lead_ids = {}
      people = People::Registry.new
      register_people(dir, people)
      Reader::SPEC.each do |file, spec|
        raise Cancelled if cancel&.call

        table = spec[:table]
        People.copy!(connection.raw_connection, agency.id, people, stamp(now)) if table == :leads
        copy_file(table, File.join(dir.to_s, file), spec, agency, lead_ids, people, now, step, cancel)
        lead_ids = Lead.unscoped.where(agency_id: agency.id).pluck(:external_id, :id).to_h if table == :leads
      end
    end

    # First pass over leads.csv: every lead's person is known before any lead is written, so the people
    # can be COPYed first and the leads' foreign key can stay immediate (a deferred one queued one check
    # per lead until commit). Skips the same duplicate rows the leads COPY skips.
    def self.register_people(dir, people)
      spec = Reader::SPEC.fetch("leads.csv")
      dedupe = Dedupe::Filter.new(:leads)
      CSV.foreach(File.join(dir.to_s, "leads.csv"), headers: true, encoding: "bom|utf-8") do |csv_row|
        row = typed_row(spec, csv_row)
        people.register(row[:external_id], row[:email]) if dedupe.keep?(row)
      end
    end

    def self.copy_file(table, path, spec, agency, lead_ids, people, now, step, cancel)
      raw = connection.raw_connection
      sql = "COPY #{table} (#{COPY_COLUMNS.fetch(table).join(', ')}) FROM STDIN WITH (FORMAT csv)"
      batch = []
      # The first row of each natural key is loaded; later copies are the duplicates the report announced.
      dedupe = Dedupe::Filter.new(table)
      CSV.foreach(path, headers: true, encoding: "bom|utf-8") do |csv_row|
        row = typed_row(spec, csv_row)
        batch << row if dedupe.keep?(row)
        next if batch.size < BATCH

        write_batch(raw, sql, table, batch, agency, lead_ids, people, now)
        step.call(batch.size)
        batch.clear
        raise Cancelled if cancel&.call
      end
      write_batch(raw, sql, table, batch, agency, lead_ids, people, now) unless batch.empty?
    end

    # One COPY per batch, flushed in bounded chunks. An exception aborts the stream cleanly so the
    # surrounding transaction can roll back.
    def self.write_batch(raw, sql, table, batch, agency, lead_ids, people, now)
      raw.copy_data(sql) do
        buffer = +""
        batch.each do |row|
          buffer << CSV.generate_line(row_values(table, row, agency, lead_ids, people, now))
          next if buffer.bytesize < FLUSH_BYTES

          raw.put_copy_data(buffer)
          buffer.clear
        end
        raw.put_copy_data(buffer) unless buffer.empty?
      end
    end

    # CSV row → typed row in the Snapshot::Reader shape (values are already known valid: the report
    # said so, or validate! raised).
    def self.typed_row(spec, csv_row)
      spec[:columns].to_h do |header, (key, type)|
        [ key, parse_value(csv_row[header], type) ]
      end
    end

    def self.parse_value(raw, type)
      value = raw.is_a?(String) ? raw.strip : raw
      return nil if value.nil? || value.empty?

      case type
      when :time then Time.iso8601(value).utc
      when :date then Date.iso8601(value)
      when :integer then Integer(value, 10)
      else value
      end
    end

    # Values aligned with COPY_COLUMNS. nil is written as an empty field → NULL; Time/Date are
    # ISO-8601 so Postgres parses them without a cast.
    def self.row_values(table, row, agency, lead_ids, people, now)
      case table
      when :leads
        [ agency.id, people.person_id(row[:external_id]), row[:external_id], stamp(row[:created_at]), row[:first_name], row[:last_name],
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

    def self.total_rows(report)
      report[:diff].sum { |_table, diff| diff[:incoming].to_i }
    end

    def self.row_counts(report)
      report[:diff].transform_values { |diff| diff[:incoming] }.transform_keys(&:to_s)
    end

    # The stored report has string keys (jsonb); a freshly computed one has symbols.
    def self.symbolize(report)
      report.respond_to?(:deep_symbolize_keys) ? report.deep_symbolize_keys : report
    end

    def self.connection
      ActiveRecord::Base.connection
    end
  end
end

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
  # (children cascade) → 5,000-row batches → Snapshot::Facts → snapshots row. A failure rolls
  # back to the previous snapshot and a reload never double counts.
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

    TABLES = %i[
      leads stage_events contacts screener_answers web_sessions appointments applications
    ].freeze

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
      step = tracker(progress, TABLES.sum { |table| rows[table].size })
      ids = insert_leads(agency, rows[:leads], step, cancel)
      insert_children(StageEvent, rows[:stage_events], ids, agency, step, cancel) do |row|
        { stage: row[:stage], entered_at: row[:entered_at] }
      end
      insert_children(Contact, rows[:contacts], ids, agency, step, cancel) do |row|
        { contacted_at: row[:contacted_at], direction: row[:direction], channel: row[:channel],
          contacted_by: row[:contacted_by] }
      end
      insert_children(WebSession, rows[:web_sessions], ids, agency, step, cancel) do |row|
        { started_at: row[:started_at], landing_url: row[:landing_url], pages_viewed: row[:pages_viewed],
          referrer: row[:referrer], device: row[:device] }
      end
      insert_children(Appointment, rows[:appointments], ids, agency, step, cancel) do |row|
        { booked_at: row[:booked_at], scheduled_for: row[:scheduled_for], status: row[:status] }
      end
      insert_children(Application, rows[:applications], ids, agency, step, cancel) do |row|
        { started_at: row[:started_at], submitted_at: row[:submitted_at],
          percent_complete: row[:percent_complete], last_section_completed: row[:last_section_completed] }
      end
      insert_screener(rows[:screener_answers], ids, agency, step, cancel)
    end

    def self.insert_leads(agency, rows, step, cancel)
      each_batch(rows, step, cancel) do |batch|
        Lead.unscoped.insert_all!(batch.map { |row| lead_attributes(agency, row) })
      end
      Lead.unscoped.where(agency_id: agency.id).pluck(:external_id, :id).to_h
    end

    def self.lead_attributes(agency, row)
      {
        agency_id: agency.id,
        external_id: row[:external_id],
        lead_created_at: row[:created_at],
        first_name: row[:first_name], last_name: row[:last_name],
        email: row[:email], phone: row[:phone], state: row[:state],
        source_raw: row[:source],
        channel: Channels::Normalizer.call(row[:source]).first,
        campaign: row[:campaign], ad: row[:ad], coordinator_name: row[:coordinator],
        current_stage: row[:current_stage], outcome: row[:outcome], outcome_reason: row[:outcome_reason],
        outcome_updated_at: row[:outcome_updated_at], paused_until: row[:paused_until]
      }
    end

    def self.insert_children(model, rows, ids, agency, step, cancel)
      each_batch(rows, step, cancel) do |batch|
        attributes = batch.map do |row|
          yield(row).merge(agency_id: agency.id, lead_id: ids.fetch(row[:external_id]))
        end
        model.unscoped.insert_all!(attributes)
      end
    end

    # Screener answers go through the encrypted attribute type so the plaintext never reaches the
    # answer column (docs/conventions/sensitive-data.md); `insert_all` casts it, exactly like the
    # spec-only RowsLoader.
    def self.insert_screener(rows, ids, agency, step, cancel)
      each_batch(rows, step, cancel) do |batch|
        attributes = batch.map do |row|
          { agency_id: agency.id, lead_id: ids.fetch(row[:external_id]),
            submitted_at: row[:submitted_at], question: row[:question], answer: row[:answer],
            meets_requirement: row[:meets_requirement] }
        end
        ScreenerAnswer.unscoped.insert_all!(attributes)
      end
    end

    def self.each_batch(rows, step, cancel)
      return if rows.empty?

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

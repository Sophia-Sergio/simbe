require "csv"

# Snapshot::Validator turns a parsed upload (Snapshot::Reader) into the report the UI shows
# and the importer trusts: blocking `errors`, non-blocking `warnings`, a per-table `diff`,
# the `checks` summary and the snapshot's `as_of` (spec 2002 decision 7, override 5).
#
# Deliberately agency-local: it reads only THIS agency's rows. There is no cross-agency check
# (a second agency may legitimately upload the same export, and looking at another tenant's
# ids would leak data — lane override 2); the only agency test is `agency_mismatch` against
# the agency's own current leads. `unscoped` is allowed here (docs/conventions/multi-tenancy.md).
#
# The report never contains cell values (only file, row number and code) — the exports are
# health-like data (docs/conventions/sensitive-data.md).
class Snapshot
  module Validator
    # Blocking error codes (contracts/openapi/schemas/snapshots.yaml#/ReportIssue).
    ERROR_CODES = %w[missing_file bad_headers bad_value duplicate_key orphan_row agency_mismatch].freeze

    TABLES = %i[
      leads stage_events contacts screener_answers web_sessions appointments applications
    ].freeze

    # Table → export file, for error attribution (Snapshot::Reader::SPEC is the parser; this
    # mirrors it without coupling the report to a spec-only constant).
    FILE_FOR = {
      leads: "leads.csv",
      stage_events: "stage_history.csv",
      contacts: "contact_log.csv",
      screener_answers: "screener_answers.csv",
      web_sessions: "web_sessions.csv",
      appointments: "appointments.csv",
      applications: "applications.csv"
    }.freeze

    # Natural keys, unique per agency (spec 2002 decision 2). Rows linked by `:external_id`.
    NATURAL_KEYS = {
      leads: %i[external_id],
      stage_events: %i[external_id stage],
      contacts: %i[external_id contacted_at direction channel],
      screener_answers: %i[external_id question],
      web_sessions: %i[external_id started_at],
      appointments: %i[external_id booked_at],
      applications: %i[external_id started_at]
    }.freeze

    CHILD_TABLES = %i[
      stage_events contacts screener_answers web_sessions appointments applications
    ].freeze

    # Enum columns (the Reader already types timestamps and integers).
    ENUMS = {
      leads: { current_stage: Constants::STAGES, outcome: Constants::OUTCOMES },
      stage_events: { stage: Constants::STAGES },
      screener_answers: { meets_requirement: %w[yes review no] },
      appointments: { status: %w[scheduled attended no_show cancelled] },
      contacts: { direction: %w[inbound outbound] }
    }.freeze

    # Sources already in canonical lowercase form (mirrors bin/golden-numbers).
    CANONICAL_SOURCES = %w[facebook instagram google tiktok referral].freeze

    # A systematically broken upload (for example one wrong header) can flag every row, so the
    # report's error list is bounded; `ok` and `checks` still reflect the full picture.
    MAX_ERRORS = 50

    # -> Hash report: { ok:, errors:, warnings:, ignored:, diff:, checks:, as_of: } (symbol keys).
    # `rows` lets the caller reuse the parse it already did (the upload job); otherwise the file
    # is parsed here.
    def self.call(agency:, dir:, rows: nil)
      rows ||= Reader.call(dir)
      errors = reader_errors(rows) + header_errors(dir) + missing_file_errors(dir)

      duplicates = duplicate_keys(rows)
      duplicates.each { |table, key| push(errors, duplicate_issue(table, key)) }

      orphans = orphan_external_ids(rows)
      orphans.each { |(table, external_id)| push(errors, orphan_issue(table, external_id)) }

      enum_errors(rows).each { |issue| push(errors, issue) }
      push(errors, mismatch_issue) if agency_mismatch?(agency, rows)

      {
        ok: errors.empty?,
        errors: errors,
        warnings: warnings(rows),
        ignored: ignored_files(dir),
        diff: diff(agency, rows),
        checks: {
          files_matched: "#{present_files(dir).size} of #{Constants::REQUIRED_FILES.size}",
          duplicates: duplicates.size,
          screener_encrypted: true
        },
        as_of: AsOf.call(rows)
      }
    end

    # ---- errors -------------------------------------------------------------------------

    # Reader problems (unparseable values, malformed CSV) are blocking; the Reader's own
    # `malformed_csv` code is outside the contract's enum, so it is reported as a bad_value.
    def self.reader_errors(rows)
      rows.errors.first(MAX_ERRORS).map do |error|
        code = ERROR_CODES.include?(error[:code]) ? error[:code] : "bad_value"
        issue(code, file: error[:file], row: error[:row], message: error[:message])
      end
    end

    def self.missing_file_errors(dir)
      (Constants::REQUIRED_FILES - present_files(dir)).first(MAX_ERRORS).map do |file|
        issue("missing_file", file: file, message: "#{file} was not uploaded")
      end
    end

    # Headers must match exactly (spec 2002 decision 7). The first line only, so a 69 MB file
    # is not read again.
    def self.header_errors(dir)
      errors = []
      Constants::REQUIRED_FILES.each do |file|
        path = path_for(dir, file)
        next unless path
        next if first_row(path) == Constants::HEADERS[file]

        push(errors, issue("bad_headers", file: file, message: "#{file} has unexpected headers"))
      end
      errors
    end

    def self.first_row(path)
      File.open(path, "r:bom|utf-8") { |io| CSV.parse_line(io.readline) }
    rescue EOFError, CSV::MalformedCSVError, EncodingError
      nil
    end

    # [[table, key_tuple], ...] for every natural key that appears more than once.
    def self.duplicate_keys(rows)
      NATURAL_KEYS.flat_map do |table, columns|
        seen = Hash.new(0)
        rows[table].each { |row| seen[columns.map { |column| row[column] }] += 1 }
        seen.select { |_key, count| count > 1 }.keys.map { |key| [ table, key ] }
      end
    end

    def self.duplicate_issue(table, key)
      columns = NATURAL_KEYS.fetch(table).join(", ")
      issue("duplicate_key", file: FILE_FOR.fetch(table),
                             message: "Duplicate (#{columns}) in #{FILE_FOR.fetch(table)}")
    end

    # [[table, external_id], ...] unique, for child rows whose lead_id is not in leads.csv.
    def self.orphan_external_ids(rows)
      lead_ids = {}
      rows[:leads].each { |row| lead_ids[row[:external_id]] = true }
      seen = {}
      orphans = []
      CHILD_TABLES.each do |table|
        rows[table].each do |row|
          external_id = row[:external_id]
          next if lead_ids[external_id] || seen[[ table, external_id ]]

          seen[[ table, external_id ]] = true
          orphans << [ table, external_id ]
          return orphans if orphans.size >= MAX_ERRORS
        end
      end
      orphans
    end

    def self.orphan_issue(table, _external_id)
      issue("orphan_row", file: FILE_FOR.fetch(table),
                          message: "#{FILE_FOR.fetch(table)} has rows whose lead_id is not in leads.csv")
    end

    def self.enum_errors(rows)
      errors = []
      ENUMS.each do |table, columns|
        columns.each do |column, allowed|
          rows[table].each do |row|
            value = row[column]
            next if value.nil? || allowed.include?(value)

            push(errors, issue("bad_value", file: FILE_FOR.fetch(table),
                                          message: "invalid #{column} in #{FILE_FOR.fetch(table)}"))
            break if errors.size >= MAX_ERRORS
          end
          break if errors.size >= MAX_ERRORS
        end
        break if errors.size >= MAX_ERRORS
      end
      errors
    end

    # If this agency already has a snapshot, at least half of its current external ids must be
    # back in the new leads.csv — otherwise the file probably belongs to another agency.
    def self.agency_mismatch?(agency, rows)
      current = Lead.unscoped.where(agency_id: agency.id).pluck(:external_id)
      return false if current.empty?

      incoming = {}
      rows[:leads].each { |row| incoming[row[:external_id]] = true }
      overlap = current.count { |id| incoming[id] }
      overlap * 2 < current.size
    end

    def self.mismatch_issue
      issue("agency_mismatch", file: "leads.csv",
                               message: "This file matches less than half of the agency's current leads")
    end

    # ---- warnings -----------------------------------------------------------------------

    # Only non-zero warnings are listed (the contract examples show just the ones that fired).
    # Counts follow spec 2002 decision 7 and mirror bin/golden-numbers:
    #   stage_mismatch            leads whose current_stage is not the furthest stage in the trail
    #   unknown_source            leads with a non-blank source outside the known map
    #   duplicate_email           EXTRA rows (leads - distinct emails)
    #   source_aliases_normalized leads whose raw source is not already canonical
    def self.warnings(rows)
      leads = rows[:leads]
      out = []

      mismatch = stage_mismatch_count(leads, rows[:stage_events])
      out << warning("stage_mismatch", mismatch,
                     "#{mismatch} leads have a current stage that is not their furthest stage") if mismatch.positive?

      unknown = leads.count { |row| row[:source] && !Channels::Normalizer.call(row[:source]).last }
      out << warning("unknown_source", unknown,
                     "#{unknown} leads came from an unrecognized source") if unknown.positive?

      duplicates = duplicate_email_extra_rows(leads)
      out << warning("duplicate_email", duplicates,
                     "#{duplicates} extra leads share an email with another lead (kept separate)") if duplicates.positive?

      aliases = leads.count { |row| source_aliases?(row[:source]) }
      out << warning("source_aliases_normalized", aliases,
                     "Normalized #{aliases} non-canonical source spellings") if aliases.positive?

      out
    end

    def self.stage_mismatch_count(leads, stage_events)
      history = Hash.new { |hash, key| hash[key] = [] }
      stage_events.each { |event| history[event[:external_id]] << event[:stage] }
      leads.count do |lead|
        furthest = history[lead[:external_id]].filter_map { |stage| Constants::STAGES.index(stage) }.max
        furthest && Constants::STAGES[furthest] != lead[:current_stage]
      end
    end

    def self.duplicate_email_extra_rows(leads)
      counts = Hash.new(0)
      leads.each { |row| counts[row[:email].to_s.strip.downcase] += 1 }
      counts.sum { |_email, count| count > 1 ? count - 1 : 0 }
    end

    # true when the raw spelling is not already the canonical lowercase one.
    def self.source_aliases?(source)
      value = source.to_s
      stripped = value.strip.downcase
      return false if stripped.empty?

      !CANONICAL_SOURCES.include?(stripped) || value != stripped
    end

    def self.warning(code, count, message)
      { code: code, count: count, message: message }
    end

    # ---- diff / files -------------------------------------------------------------------

    # Per-table { current:, incoming:, delta: } (spec decision 7), in export order.
    def self.diff(agency, rows)
      counts = current_counts(agency)
      TABLES.index_with do |table|
        incoming = rows[table].size
        current = counts.fetch(table)
        { current: current, incoming: incoming, delta: incoming - current }
      end
    end

    def self.current_counts(agency)
      {
        leads: Lead.unscoped.where(agency_id: agency.id).count,
        stage_events: StageEvent.unscoped.where(agency_id: agency.id).count,
        contacts: Contact.unscoped.where(agency_id: agency.id).count,
        screener_answers: ScreenerAnswer.unscoped.where(agency_id: agency.id).count,
        web_sessions: WebSession.unscoped.where(agency_id: agency.id).count,
        appointments: Appointment.unscoped.where(agency_id: agency.id).count,
        applications: Application.unscoped.where(agency_id: agency.id).count
      }
    end

    # Required files present in the directory, matched by basename case-insensitively.
    def self.present_files(dir)
      names = entries(dir).index_by(&:downcase)
      Constants::REQUIRED_FILES.select { |file| names.key?(file) }
    end

    # Uploaded files that match none of the seven names (case-insensitive).
    def self.ignored_files(dir)
      entries(dir).reject { |name| Constants::REQUIRED_FILES.include?(name.downcase) }.sort
    end

    def self.path_for(dir, file)
      name = entries(dir).find { |entry| entry.downcase == file }
      name && File.join(dir.to_s, name)
    end

    def self.entries(dir)
      dir && Dir.exist?(dir) ? Dir.children(dir) : []
    end

    # ---- helpers ------------------------------------------------------------------------

    def self.issue(code, file: nil, row: nil, message: nil)
      { code: code, file: file, row: row, message: message }
    end

    def self.push(errors, issue)
      errors << issue if errors.size < MAX_ERRORS
    end
  end
end

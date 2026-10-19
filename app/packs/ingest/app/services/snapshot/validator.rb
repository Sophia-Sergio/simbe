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
    ERROR_CODES = %w[missing_file bad_headers bad_value orphan_row agency_mismatch].freeze

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

    NATURAL_KEYS = Dedupe::NATURAL_KEYS

    # Columns the database cannot store a row without (NOT NULL) plus the natural-key parts, so a blank
    # one is reported here with its row instead of failing the load later.
    REQUIRED = {
      leads: %i[external_id created_at current_stage outcome],
      stage_events: %i[external_id stage entered_at],
      contacts: %i[external_id contacted_at],
      screener_answers: %i[external_id question],
      web_sessions: %i[external_id started_at],
      appointments: %i[external_id booked_at],
      applications: %i[external_id started_at]
    }.freeze

    # Lead ids must be lowercase, hyphenated UUIDs: the importer links child rows to leads through the
    # id Postgres stores, which is always that form.
    UUID = /\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/

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
    # is parsed here. `ignored` is the uploaded names that matched none of the seven files (the
    # upload job knows them from the request; without it they are read back from the directory).
    def self.call(agency:, dir:, rows: nil, ignored: nil)
      rows ||= Reader.call(dir)
      errors = reader_errors(rows) + header_errors(dir) + missing_file_errors(dir)

      dropped = Dedupe.dropped_counts(rows)

      required_errors(rows).each { |issue| push(errors, issue) }
      orphan_errors(rows).each { |issue| push(errors, issue) }
      enum_errors(rows).each { |issue| push(errors, issue) }
      push(errors, mismatch_issue) if agency_mismatch?(agency, rows)

      {
        ok: errors.empty?,
        errors: errors,
        warnings: duplicate_row_warnings(dropped) + warnings(rows),
        ignored: ignored || ignored_files(dir),
        diff: diff(agency, rows, dropped),
        checks: {
          files_matched: "#{present_files(dir).size} of #{Constants::REQUIRED_FILES.size}",
          duplicates: dropped.values.sum,
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

    # Blank required cells and malformed lead ids, one issue per file and column with the count and
    # the first offending row (row = the record's position in the file, the header being row 1).
    def self.required_errors(rows)
      tally = Tally.new
      REQUIRED.each do |table, columns|
        rows[table].each_with_index do |row, index|
          columns.each do |column|
            next unless row[column].nil?

            tally.add([ table, column, :blank ], index + 2)
          end
          next unless table == :leads && row[:external_id] && !UUID.match?(row[:external_id])

          tally.add([ table, :external_id, :uuid ], index + 2)
        end
      end
      tally.issues do |(table, column, problem), count, first|
        file = FILE_FOR.fetch(table)
        header = header_for(table, column)
        message = if problem == :uuid
          "#{file} has #{rows_phrase(count)} where #{header} is not a lowercase UUID (first at row #{first})"
        else
          "#{file} has #{rows_phrase(count)} with a blank #{header} (first at row #{first})"
        end
        issue("bad_value", file: file, row: first, message: message)
      end
    end

    # Child rows whose lead_id is not in leads.csv, one issue per file.
    def self.orphan_errors(rows)
      lead_ids = {}
      rows[:leads].each { |row| lead_ids[row[:external_id]] = true }
      tally = Tally.new
      CHILD_TABLES.each do |table|
        rows[table].each_with_index do |row, index|
          external_id = row[:external_id]
          # A blank lead_id is already reported as a missing value.
          tally.add([ table ], index + 2) unless external_id.nil? || lead_ids[external_id]
        end
      end
      tally.issues do |(table), count, first|
        file = FILE_FOR.fetch(table)
        issue("orphan_row", file: file, row: first,
                            message: "#{file} has #{rows_phrase(count)} whose lead_id is not in leads.csv (first at row #{first})")
      end
    end

    def self.enum_errors(rows)
      tally = Tally.new
      ENUMS.each do |table, columns|
        columns.each do |column, allowed|
          rows[table].each_with_index do |row, index|
            value = row[column]
            # Blank is the required-value check's business, not an enum miss.
            tally.add([ table, column ], index + 2) unless value.nil? || allowed.include?(value)
          end
        end
      end
      tally.issues do |(table, column), count, first|
        file = FILE_FOR.fetch(table)
        issue("bad_value", file: file, row: first,
                           message: "#{file} has #{rows_phrase(count)} with an invalid #{column} (first at row #{first})")
      end
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

    # One warning per file that had duplicate rows: the report says how many and that one is kept.
    def self.duplicate_row_warnings(dropped)
      dropped.map do |table, count|
        warning("duplicate_rows_dropped", count,
                "#{FILE_FOR.fetch(table)} has #{count} duplicate #{count == 1 ? 'row' : 'rows'}: we will keep just one of each")
      end
    end

    # Only non-zero warnings are listed (the contract examples show just the ones that fired).
    # Counts follow spec 2002 decision 7 and mirror bin/golden-numbers:
    #   stage_mismatch            leads whose current_stage is not the furthest stage in the trail
    #   unknown_source            leads with a non-blank source outside the known map
    #   duplicate_email           EXTRA rows (leads - distinct emails)
    #   open_duplicate_inquiry    pairs of one person's inquiries that were open at the same time
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
                     "#{duplicates} extra leads share an email with another lead; " \
                     "they are linked as one person and kept as separate inquiries") if duplicates.positive?

      overlapping = open_duplicate_inquiry_pairs(leads)
      out << warning("open_duplicate_inquiry", overlapping,
                     "#{overlapping} pairs of inquiries from the same person were open at the same time") if overlapping.positive?

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

    # Pairs of inquiries from one person (same email) where the earlier one had not closed before the
    # later one was created: the same rule the lead panel uses (Leads::Overlap).
    def self.open_duplicate_inquiry_pairs(leads)
      leads.group_by { |row| Snapshot::People.key_for(row[:email]) }.sum do |key, group|
        next 0 if key.nil? || group.size < 2

        inquiries = group.map do |row|
          { id: row[:external_id], created_at: row[:created_at], outcome: row[:outcome],
            outcome_updated_at: row[:outcome_updated_at] }
        end
        Leads::Overlap.pairs(inquiries).size
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
    # `incoming` counts the rows that will be loaded, so duplicates dropped by Snapshot::Dedupe are not in it.
    def self.diff(agency, rows, dropped = {})
      counts = current_counts(agency)
      TABLES.index_with do |table|
        incoming = rows[table].size - dropped.fetch(table, 0)
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

    def self.rows_phrase(count)
      "#{count} #{count == 1 ? 'row' : 'rows'}"
    end

    # The CSV header of a typed column (external_id is lead_id in the files).
    def self.header_for(table, column)
      spec = Reader::SPEC.values.find { |entry| entry[:table] == table }
      spec[:columns].find { |_header, (key, _type)| key == column }.first
    end

    # Groups hits by key, remembering how many and the first row, so a systematically broken file
    # yields one issue per problem instead of one per row.
    class Tally
      def initialize
        @groups = {}
      end

      def add(key, row)
        group = (@groups[key] ||= { count: 0, first: row })
        group[:count] += 1
      end

      def issues(&block)
        @groups.map { |key, group| block.call(key, group[:count], group[:first]) }
      end
    end

    def self.issue(code, file: nil, row: nil, message: nil)
      { code: code, file: file, row: row, message: message }
    end

    def self.push(errors, issue)
      errors << issue if errors.size < MAX_ERRORS
    end
  end
end

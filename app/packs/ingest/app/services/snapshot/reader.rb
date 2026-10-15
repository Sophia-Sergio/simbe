require "csv"
require "time"

# Snapshot::Reader parses an agency's seven CSV exports into typed rows.
#
# The output is a Snapshot::Rows holding one Array<Hash> per table, in exactly the
# canonical shape of `ExportBuilder#rows` (child rows are linked back to their lead by
# `:external_id`, `lead_id` → `:external_id`). Values are typed: timestamps → Time (UTC),
# `paused_until` → Date, `percent_complete` → Integer; blank cells → nil; `pages_viewed`
# stays a String. BOM and CRLF are tolerated (`"bom|utf-8"`). Each file is streamed once
# and every unparseable value is collected as a `bad_value` error with its file and the
# CSV row number, so the Validator (B-INGEST) can report without re-reading the file.
#
# `unscoped` is not used here: the Reader never touches the database.
class Snapshot
  # Typed rows plus the parse errors. `#[]` reads one table; `#each_slice` yields the
  # table in batches for the importer's bulk inserts.
  class Rows
    TABLES = %i[leads stage_events contacts screener_answers web_sessions appointments applications].freeze

    attr_reader :errors

    def initialize(tables, errors)
      @tables = tables
      @errors = errors
    end

    def [](table)
      @tables.fetch(table.to_sym)
    end

    def tables
      @tables
    end

    # rows.each_slice(:screener_answers, 5_000) { |batch| ... } (or returns an Enumerator).
    def each_slice(table, size, &block)
      enum = @tables.fetch(table.to_sym).each_slice(size)
      block ? enum.each(&block) : enum
    end
  end

  module Reader
    # Export file → table and the exact CSV header column → typed row key.
    # The types: :time (Time, UTC), :date (Date), :integer (Integer), :string (kept).
    SPEC = {
      "leads.csv" => {
        table: :leads,
        columns: {
          "lead_id" => %i[external_id string],
          "created_at" => %i[created_at time],
          "first_name" => %i[first_name string],
          "last_name" => %i[last_name string],
          "email" => %i[email string],
          "phone" => %i[phone string],
          "state" => %i[state string],
          "source" => %i[source string],
          "campaign" => %i[campaign string],
          "ad" => %i[ad string],
          "coordinator" => %i[coordinator string],
          "current_stage" => %i[current_stage string],
          "outcome" => %i[outcome string],
          "outcome_reason" => %i[outcome_reason string],
          "outcome_updated_at" => %i[outcome_updated_at time],
          "paused_until" => %i[paused_until date]
        }
      },
      "stage_history.csv" => {
        table: :stage_events,
        columns: {
          "lead_id" => %i[external_id string],
          "stage" => %i[stage string],
          "entered_at" => %i[entered_at time]
        }
      },
      "contact_log.csv" => {
        table: :contacts,
        columns: {
          "lead_id" => %i[external_id string],
          "contacted_at" => %i[contacted_at time],
          "direction" => %i[direction string],
          "channel" => %i[channel string],
          "contacted_by" => %i[contacted_by string]
        }
      },
      "screener_answers.csv" => {
        table: :screener_answers,
        columns: {
          "lead_id" => %i[external_id string],
          "submitted_at" => %i[submitted_at time],
          "question" => %i[question string],
          "answer" => %i[answer string],
          "meets_requirement" => %i[meets_requirement string]
        }
      },
      "web_sessions.csv" => {
        table: :web_sessions,
        columns: {
          "lead_id" => %i[external_id string],
          "started_at" => %i[started_at time],
          "landing_url" => %i[landing_url string],
          "pages_viewed" => %i[pages_viewed string],
          "referrer" => %i[referrer string],
          "device" => %i[device string]
        }
      },
      "appointments.csv" => {
        table: :appointments,
        columns: {
          "lead_id" => %i[external_id string],
          "booked_at" => %i[booked_at time],
          "scheduled_for" => %i[scheduled_for time],
          "status" => %i[status string]
        }
      },
      "applications.csv" => {
        table: :applications,
        columns: {
          "lead_id" => %i[external_id string],
          "started_at" => %i[started_at time],
          "submitted_at" => %i[submitted_at time],
          "percent_complete" => %i[percent_complete integer],
          "last_section_completed" => %i[last_section_completed string]
        }
      }
    }.freeze

    # Parses every present export in +dir+ and returns a Snapshot::Rows. A missing file is
    # not an error here — the Validator owns `missing_file`.
    def self.call(dir)
      tables = Rows::TABLES.index_with { [] }
      errors = []
      SPEC.each do |filename, spec|
        path = File.join(dir.to_s, filename)
        next unless File.file?(path)

        read_file(path, filename, spec, tables, errors)
      end
      Rows.new(tables, errors)
    end

    def self.read_file(path, filename, spec, tables, errors)
      File.open(path, "r:bom|utf-8") do |io|
        csv = CSV.new(io, headers: true)
        csv.each do |row|
          parsed = {}
          spec[:columns].each do |header, (key, type)|
            parsed[key] = parse_value(row[header], type, filename, csv.lineno, errors)
          end
          tables.fetch(spec[:table]) << parsed
        end
      end
    end

    def self.parse_value(raw, type, filename, lineno, errors)
      value = raw.is_a?(String) ? raw.strip : raw
      return nil if value.nil? || value.empty?

      case type
      when :time then Time.iso8601(value).utc
      when :date then Date.parse(value)
      when :integer then Integer(value, 10)
      else value
      end
    rescue ArgumentError, TypeError => e
      errors << { file: filename, row: lineno, code: "bad_value", message: "#{e.message} (#{raw.inspect})" }
      nil
    end
  end
end

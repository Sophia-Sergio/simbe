# Test-only builder for an agency's seven CSV exports
# (handoff/takehome/exports/README.md). Chainable: every `lead` call appends one lead and
# its related rows. `#rows` returns the typed rows in the canonical shape the
# Snapshot::Reader (task 4b) parses into — child rows keyed back to their lead by
# `:external_id` — and `#write` emits the seven CSVs with the exact export headers.
#
# A lead is identified by insertion order: the first is L1, the next L2, and so on, so
# first_name/last_name/email/phone fall out of the Alpha naming convention unless overridden.
#
# Lives under spec/ (never autoloaded): spec/rails_helper.rb requires it.
class ExportBuilder
  # entered_at = created + offset, from the ingest plan's exact Alpha timestamps.
  STAGE_OFFSETS = {
    "inquiry" => 0,
    "pre_screen" => 10 * 60,
    "application" => 1.day,
    "consult" => 2.days,
    "records" => 4.days,
    "accepted" => 6.days
  }.freeze

  AGE_QUESTION = "How old are you?"

  # The ten screener questions of contracts/examples/leads/detail-owner.json.
  SCREENER_QUESTIONS = [
    AGE_QUESTION,
    "Are you a U.S. citizen or permanent resident?",
    "Have you given birth to at least one child?",
    "Is your BMI between 19 and 32?",
    "Do you smoke or use nicotine?",
    "Do you live in a state where we work?",
    "Do you have a support partner?",
    "Is your household income above the minimum?",
    "Do you have a criminal record?",
    "Have you been a surrogate before?"
  ].freeze

  # Table symbol → export file name (Snapshot::Constants::HEADERS is keyed by file name).
  TABLES = {
    leads: "leads.csv",
    stage_events: "stage_history.csv",
    contacts: "contact_log.csv",
    screener_answers: "screener_answers.csv",
    web_sessions: "web_sessions.csv",
    appointments: "appointments.csv",
    applications: "applications.csv"
  }.freeze

  def initialize
    @tables = TABLES.keys.index_with { |table| [] }
  end

  def self.to_time(value)
    return nil if value.nil? || value == ""

    case value
    when Time then value.utc
    when String then Time.iso8601(value).utc
    else value
    end
  end

  def self.to_date(value)
    return nil if value.nil? || value == ""

    value.is_a?(Date) && !value.is_a?(DateTime) ? value : Date.parse(value.to_s)
  end

  def self.stage_at(created, stage)
    to_time(created) + STAGE_OFFSETS.fetch(stage.to_s)
  end

  def lead(id:, created:, source: nil, campaign: nil, ad: nil, coordinator: nil, state: nil,
           stage: "inquiry", outcome: "open", reason: nil, paused_until: nil, history: [],
           outbound_at: nil, inbound_at: nil, application: nil, appointment: nil,
           screener: nil, outcome_updated_at: nil, age: nil, web_session: nil,
           first_name: nil, last_name: nil, email: nil, phone: nil)
    created_at = self.class.to_time(created)
    number = @tables[:leads].size + 1

    @tables[:leads] << {
      external_id: id,
      created_at: created_at,
      first_name: first_name || "L#{number}",
      last_name: last_name || "Alpha",
      email: email || "l#{number}.alpha@example.com",
      phone: phone || format("555-0183-%04d", number),
      state: state,
      source: blank_to_nil(source),
      campaign: blank_to_nil(campaign),
      ad: blank_to_nil(ad),
      coordinator: coordinator,
      current_stage: stage,
      outcome: outcome,
      outcome_reason: reason,
      outcome_updated_at: self.class.to_time(outcome_updated_at),
      paused_until: self.class.to_date(paused_until)
    }

    add_stage_events(id, created_at, history)
    add_contacts(id, outbound_at, inbound_at, coordinator)
    add_screener(id, created_at, screener, age)
    add_web_session(id, web_session)
    add_application(id, application)
    add_appointment(id, appointment)
    self
  end

  # The canonical typed rows: each table is an Array of Hashes, child rows linked by :external_id.
  def rows
    @tables.dup
  end

  # Writes the seven CSVs (exact headers, `lead_id` = external_id) into dir and returns dir.
  def write(dir)
    FileUtils.mkdir_p(dir)
    TABLES.each do |table, filename|
      write_csv(File.join(dir, filename), Snapshot::Constants::HEADERS.fetch(filename), @tables.fetch(table))
    end
    dir
  end

  private

  def add_stage_events(id, created_at, history)
    history.each do |entry|
      stage, at = history_entry(entry)
      entered_at = at ? self.class.to_time(at) : self.class.stage_at(created_at, stage)
      @tables[:stage_events] << { external_id: id, stage: stage, entered_at: entered_at }
    end
  end

  def history_entry(entry)
    case entry
    when Hash then [ entry.fetch(:stage), entry[:at] ]
    when Array then [ entry[0], entry[1] ]
    else [ entry, nil ]
    end
  end

  def add_contacts(id, outbound_at, inbound_at, coordinator)
    if outbound_at
      @tables[:contacts] << { external_id: id, contacted_at: self.class.to_time(outbound_at),
                              direction: "outbound", channel: "text", contacted_by: coordinator }
    end
    return unless inbound_at

    @tables[:contacts] << { external_id: id, contacted_at: self.class.to_time(inbound_at),
                            direction: "inbound", channel: "text", contacted_by: coordinator }
  end

  def add_screener(id, created_at, screener, age)
    submitted_at = self.class.stage_at(created_at, "pre_screen")
    (screener || default_screener(age)).each do |question, answer, meets_requirement|
      @tables[:screener_answers] << { external_id: id, submitted_at: submitted_at, question: question,
                                      answer: answer, meets_requirement: meets_requirement }
    end
  end

  def default_screener(age)
    SCREENER_QUESTIONS.map do |question|
      answer = question == AGE_QUESTION ? (age && age.to_s) || "yes" : "yes"
      [ question, answer, "yes" ]
    end
  end

  def add_web_session(id, session)
    return unless session

    @tables[:web_sessions] << { external_id: id, started_at: self.class.to_time(session[:started]),
                                landing_url: session[:landing_url], pages_viewed: session[:pages_viewed],
                                referrer: session[:referrer], device: session[:device] }
  end

  def add_application(id, application)
    return unless application

    @tables[:applications] << {
      external_id: id,
      started_at: self.class.to_time(application[:started]),
      submitted_at: self.class.to_time(application[:submitted]),
      percent_complete: application[:pct],
      last_section_completed: application[:section]
    }
  end

  def add_appointment(id, appointment)
    return unless appointment

    @tables[:appointments] << {
      external_id: id,
      booked_at: self.class.to_time(appointment[:booked]),
      scheduled_for: self.class.to_time(appointment[:at]),
      status: appointment[:status]
    }
  end

  def write_csv(path, headers, rows)
    CSV.open(path, "w") do |csv|
      csv << headers
      rows.each { |row| csv << headers.map { |header| format_value(cell(row, header)) } }
    end
  end

  def cell(row, header)
    return row[:external_id] if header == "lead_id"

    row[header.to_sym]
  end

  def format_value(value)
    case value
    when Time then value.utc.iso8601(3)
    when Date then value.iso8601
    else value
    end
  end

  def blank_to_nil(value)
    value.nil? || value.to_s.strip.empty? ? nil : value
  end
end

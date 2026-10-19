# The direct, in-process snapshot loader shared by AlphaScenario.load! and RealData.load!.
# It replaces the agency's rows in one transaction (idempotent — a reload never double
# counts), then recomputes Snapshot::Facts and records a Snapshot row. Unlike the importer
# it trusts its caller and does not validate; it is the fast path for specs.
#
# `rows` is either a Snapshot::Rows (from Snapshot::Reader) or the ExportBuilder#rows Hash.
# Channels go through Channels::Normalizer; screener answers are inserted through the
# ScreenerAnswer model so `encrypts :answer` applies to health data. Lives under spec/
# (never autoloaded) and may use `unscoped`, per the W0-3 plan's global constraint.
module RowsLoader
  TABLES = %i[leads stage_events contacts screener_answers web_sessions appointments applications].freeze
  BATCH = 5_000

  # Replaces the agency's data with +rows+, recomputes the facts and records a Snapshot.
  # Returns the Snapshot. `as_of` defaults to Snapshot::AsOf.call(rows).
  def self.load!(agency, rows, as_of: nil)
    previous = Current.agency
    Current.agency = agency
    ActiveRecord::Base.transaction do
      load_rows!(agency, rows)
      Snapshot::Facts.call(agency.id)
      Snapshot.create!(agency: agency, as_of: as_of || Snapshot::AsOf.call(rows),
                       loaded_at: Time.current, row_counts: row_counts(rows), warnings: [])
    end
  ensure
    Current.agency = previous
  end

  def self.load_rows!(agency, rows)
    Lead.unscoped.where(agency_id: agency.id).delete_all
    Person.unscoped.where(agency_id: agency.id).delete_all
    ids = insert_leads(agency, rows[:leads])
    insert_children(StageEvent, rows[:stage_events], ids, agency) do |row|
      { stage: row[:stage], entered_at: row[:entered_at] }
    end
    insert_children(Contact, rows[:contacts], ids, agency) do |row|
      { contacted_at: row[:contacted_at], direction: row[:direction], channel: row[:channel],
        contacted_by: row[:contacted_by] }
    end
    insert_children(WebSession, rows[:web_sessions], ids, agency) do |row|
      { started_at: row[:started_at], landing_url: row[:landing_url], pages_viewed: row[:pages_viewed],
        referrer: row[:referrer], device: row[:device] }
    end
    insert_children(Appointment, rows[:appointments], ids, agency) do |row|
      { booked_at: row[:booked_at], scheduled_for: row[:scheduled_for], status: row[:status] }
    end
    insert_children(Application, rows[:applications], ids, agency) do |row|
      { started_at: row[:started_at], submitted_at: row[:submitted_at],
        percent_complete: row[:percent_complete], last_section_completed: row[:last_section_completed] }
    end
    insert_screener(rows[:screener_answers], ids, agency)
  end

  def self.insert_leads(agency, rows)
    person_ids = insert_people(agency, rows)
    each_batch(rows) do |batch|
      Lead.unscoped.insert_all!(batch.map { |row| lead_attributes(agency, row).merge(person_id: person_ids.fetch(row[:external_id])) })
    end
    Lead.unscoped.where(agency_id: agency.id).pluck(:external_id, :id).to_h
  end

  # One person per normalised email, one per blank-email lead -> { external_id => person_id }.
  def self.insert_people(agency, rows)
    by_key = {}
    people = []
    rows.to_h do |row|
      key = Snapshot::People.key_for(row[:email])
      id = (key && by_key[key]) || SecureRandom.uuid.tap do |new_id|
        by_key[key] = new_id if key
        people << { id: new_id, agency_id: agency.id, email_key: key, created_at: Time.current, updated_at: Time.current }
      end
      [ row[:external_id], id ]
    end.tap { each_batch(people) { |batch| Person.unscoped.insert_all!(batch) } }
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

  def self.insert_children(model, rows, ids, agency)
    each_batch(rows) do |batch|
      attributes = batch.map do |row|
        yield(row).merge(agency_id: agency.id, lead_id: ids.fetch(row[:external_id]))
      end
      model.unscoped.insert_all!(attributes)
    end
  end

  # Screener answers go through the model so `encrypts :answer` applies. insert_all casts
  # the plaintext through the encrypted attribute type, so the ciphertext lands in the
  # answer column and the model decrypts it on read (verified by the schema spec).
  def self.insert_screener(rows, ids, agency)
    each_batch(rows) do |batch|
      attributes = batch.map do |row|
        { agency_id: agency.id, lead_id: ids.fetch(row[:external_id]),
          submitted_at: row[:submitted_at], question: row[:question], answer: row[:answer],
          meets_requirement: row[:meets_requirement] }
      end
      ScreenerAnswer.unscoped.insert_all!(attributes)
    end
  end

  def self.each_batch(rows, &block)
    return if rows.empty?

    rows.each_slice(BATCH, &block)
  end

  def self.row_counts(rows)
    TABLES.index_with { |table| rows[table].size }.transform_keys(&:to_s)
  end
end

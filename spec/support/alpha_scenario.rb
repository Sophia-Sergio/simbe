# Alpha: the small, fully-derived fixture dataset every Wave-0/1 lane loads with
# `AlphaScenario.load!(agency)` (docs/superpowers/plans/2026-10/2026-10-14-2003-snapshot-ingest.md,
# task 3). The agency's milestone is `consult_attended`, timezone `America/Los_Angeles`.
#
# Derived truths (asserted by later plans):
#   leads                  10 (v1) / 12 (v2)
#   consult_attended        3  = L1, L2, L8
#   records                 2  = L1, L8
#   application_submitted   4  = L1, L2, L3, L8
#   accepted                1  = L1
#   channels (leads)        Facebook 3, Instagram 1, Google 3, Referral 1, TikTok 1, Unknown 1
#   funnel reached          inquiry 10, application 5, consult booked 4, attended 3, records 2, accepted 1
#
# `AS_OF` is the latest timestamp in the v1 rows (L6's outcome_updated_at). Lives under spec/
# (never autoloaded) and may use `unscoped`, per the W0-3 plan's global constraint.
module AlphaScenario
  AS_OF = Time.utc(2026, 10, 1, 12)
  AS_OF_V2 = Time.utc(2026, 10, 3, 12)

  class << self
    def builder(version = :v1)
      b = ExportBuilder.new
      u = uuids_for(version)
      v2 = version == :v2

      # L1 — accepted, attended consult, submitted application.
      b.lead(id: u[0], created: "2026-09-20T10:00:00Z", source: "facebook", campaign: "c-a",
             coordinator: "Jess Kim", state: "CA", age: 34,
             history: %w[inquiry pre_screen application consult records accepted],
             stage: "accepted", outcome: "accepted", outcome_updated_at: t("2026-09-26T10:00:00Z"),
             outbound_at: t("2026-09-20T10:30:00Z"),
             application: submitted_application("2026-09-20T10:00:00Z"),
             appointment: appointment("2026-09-20T10:00:00Z", status: "attended"))

      # L2 — attended consult, submitted application.
      b.lead(id: u[1], created: "2026-09-21T10:00:00Z", source: "fb", campaign: "c-a",
             coordinator: "Jess Kim", state: "CA", age: 29,
             history: %w[inquiry pre_screen application consult], stage: "consult", outcome: "open",
             outbound_at: t("2026-09-21T11:00:00Z"),
             application: submitted_application("2026-09-21T10:00:00Z"),
             appointment: appointment("2026-09-21T10:00:00Z", status: "attended"))

      # L3 — no_show consult.
      b.lead(id: u[2], created: "2026-09-22T10:00:00Z", source: "Facebook", campaign: "c-a",
             coordinator: "Dana Ortiz", state: "ID", age: 31,
             history: %w[inquiry pre_screen application consult], stage: "consult", outcome: "open",
             outbound_at: t("2026-09-22T12:00:00Z"),
             application: submitted_application("2026-09-22T10:00:00Z"),
             appointment: appointment("2026-09-22T10:00:00Z", at: t("2026-09-28T16:00:00Z"), status: "no_show"))

      # L4 — application unfinished; in v2 moved on to a scheduled consult.
      b.lead(id: u[3], created: "2026-09-23T10:00:00Z", source: "ig", campaign: "c-b",
             coordinator: "Dana Ortiz", state: "ID", age: 28,
             history: v2 ? %w[inquiry pre_screen application] + [ { stage: "consult", at: t("2026-10-02T09:00:00Z") } ] : %w[inquiry pre_screen application],
             stage: v2 ? "consult" : "application", outcome: "open",
             outbound_at: t("2026-09-23T10:10:00Z"),
             application: started_application("2026-09-23T10:00:00Z", pct: 40, section: "pregnancy_history"),
             appointment: v2 ? { booked: t("2026-10-02T09:00:00Z"), at: t("2026-10-06T16:00:00Z"), status: "scheduled" } : nil)

      # L5 — not eligible (age).
      b.lead(id: u[4], created: "2026-09-24T10:00:00Z", source: "google", campaign: "c-c",
             coordinator: "Dana Ortiz", state: "CA", age: 41,
             history: %w[inquiry pre_screen], stage: "pre_screen", outcome: "not_eligible", reason: "age",
             outcome_updated_at: t("2026-09-25T10:00:00Z"), outbound_at: t("2026-09-24T10:20:00Z"))

      # L6 — unresponsive; its outcome_updated_at is the latest timestamp in the export.
      b.lead(id: u[5], created: "2026-09-25T10:00:00Z", source: "Google", campaign: "c-c",
             coordinator: "Priya Shah", state: "CA", age: 36,
             history: %w[inquiry pre_screen], stage: "pre_screen", outcome: "unresponsive",
             outcome_updated_at: t(v2 ? "2026-10-03T12:00:00Z" : "2026-10-01T12:00:00Z"))

      # L7 — never tagged (unknown channel), no reply.
      b.lead(id: u[6], created: "2026-09-29T10:00:00Z", source: "", campaign: nil,
             coordinator: "Priya Shah", state: "CA", age: 27,
             history: %w[inquiry pre_screen], stage: "pre_screen", outcome: "open")

      # L8 — attended consult, submitted application, in records.
      b.lead(id: u[7], created: "2026-09-26T10:00:00Z", source: "referral", campaign: nil,
             coordinator: "Priya Shah", state: "CA", age: 33,
             history: %w[inquiry pre_screen application consult records], stage: "records", outcome: "open",
             outbound_at: t("2026-09-26T10:45:00Z"),
             application: submitted_application("2026-09-26T10:00:00Z"),
             appointment: appointment("2026-09-26T10:00:00Z", status: "attended"))

      # L9 — not eligible (BMI).
      b.lead(id: u[8], created: "2026-09-27T10:00:00Z", source: "tiktok", campaign: "c-d",
             coordinator: "Jess Kim", state: "CA", age: 39,
             history: %w[inquiry pre_screen], stage: "pre_screen", outcome: "not_eligible", reason: "bmi",
             outcome_updated_at: t("2026-09-28T10:00:00Z"), outbound_at: t("2026-09-27T10:15:00Z"))

      # L10 — paused through 2026-09-20 (due back as of AS_OF).
      b.lead(id: u[9], created: "2026-09-28T10:00:00Z", source: "google", campaign: "c-c",
             coordinator: "Dana Ortiz", state: "CA", age: 30,
             history: %w[inquiry pre_screen], stage: "pre_screen", outcome: "paused",
             paused_until: "2026-09-20", outbound_at: t("2026-09-28T10:25:00Z"))

      return b unless v2

      # v2 — the two new leads.
      b.lead(id: u[10], created: "2026-10-02T10:00:00Z", source: "google", campaign: "c-c",
             coordinator: "Jess Kim", state: "CA", age: 32,
             history: %w[inquiry pre_screen], stage: "pre_screen", outcome: "open",
             outbound_at: t("2026-10-02T10:30:00Z"))

      b.lead(id: u[11], created: "2026-10-03T06:00:00Z", source: "facebook", campaign: "c-a",
             coordinator: "Dana Ortiz", state: "CA", age: 26,
             history: [ "inquiry", "pre_screen", { stage: "application", at: t("2026-10-03T09:00:00Z") } ],
             stage: "application", outcome: "open", outbound_at: t("2026-10-03T06:20:00Z"),
             application: started_application("2026-10-03T06:00:00Z", pct: 20, section: "review_and_sign",
                                              started: t("2026-10-03T09:00:00Z")))
      b
    end

    # A fresh tmpdir with the seven CSVs for :v1, :v2 or :other_leads (same shape, new ids).
    def copy_dir(variant = :v1)
      builder(variant).write(Dir.mktmpdir("alpha-#{variant}"))
    end

    # Replaces the agency's data with the Alpha rows (v1 by default), recomputes the facts
    # and records a Snapshot. Returns the Snapshot.
    def load!(agency, version = :v1)
      rows = builder(version).rows
      previous = Current.agency
      Current.agency = agency
      ActiveRecord::Base.transaction do
        load_rows!(agency, rows)
        Snapshot::Facts.call(agency.id)
        Snapshot.create!(agency: agency, as_of: as_of(version), loaded_at: Time.current,
                         row_counts: row_counts(rows), warnings: [])
      end
    ensure
      Current.agency = previous
    end

    def as_of(version = :v1)
      version == :v2 ? AS_OF_V2 : AS_OF
    end

    private

    def load_rows!(agency, rows)
      Lead.unscoped.where(agency_id: agency.id).delete_all
      now = Time.current
      Lead.unscoped.insert_all!(rows[:leads].map { |row| lead_attributes(agency, row, now) })
      ids = Lead.unscoped.where(agency_id: agency.id).pluck(:external_id, :id).to_h

      insert_children(StageEvent, rows[:stage_events], ids, agency, now) do |row|
        { stage: row[:stage], entered_at: row[:entered_at] }
      end
      insert_children(Contact, rows[:contacts], ids, agency, now) do |row|
        { contacted_at: row[:contacted_at], direction: row[:direction], channel: row[:channel],
          contacted_by: row[:contacted_by] }
      end
      insert_children(WebSession, rows[:web_sessions], ids, agency, now) do |row|
        { started_at: row[:started_at], landing_url: row[:landing_url], pages_viewed: row[:pages_viewed],
          referrer: row[:referrer], device: row[:device] }
      end
      insert_children(Appointment, rows[:appointments], ids, agency, now) do |row|
        { booked_at: row[:booked_at], scheduled_for: row[:scheduled_for], status: row[:status] }
      end
      insert_children(Application, rows[:applications], ids, agency, now) do |row|
        { started_at: row[:started_at], submitted_at: row[:submitted_at],
          percent_complete: row[:percent_complete], last_section_completed: row[:last_section_completed] }
      end
      insert_screener(rows[:screener_answers], ids, agency)
    end

    def lead_attributes(agency, row, now)
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
        outcome_updated_at: row[:outcome_updated_at], paused_until: row[:paused_until],
        created_at: now, updated_at: now
      }
    end

    def insert_children(model, rows, ids, agency, now)
      return if rows.empty?

      attributes = rows.map do |row|
        yield(row).merge(agency_id: agency.id, lead_id: ids.fetch(row[:external_id]),
                         created_at: now, updated_at: now)
      end
      model.unscoped.insert_all!(attributes)
    end

    # Screener answers go through the model so `encrypts :answer` applies (health data).
    def insert_screener(rows, ids, agency)
      rows.each do |row|
        ScreenerAnswer.create!(agency_id: agency.id, lead_id: ids.fetch(row[:external_id]),
                               submitted_at: row[:submitted_at], question: row[:question],
                               answer: row[:answer], meets_requirement: row[:meets_requirement])
      end
    end

    def row_counts(rows)
      rows.transform_values(&:size).transform_keys(&:to_s)
    end

    def uuids_for(version)
      count = version == :v2 ? 12 : 10
      prefix = version == :other_leads ? SecureRandom.hex(4) : "aaaaaaaa"
      (1..count).map { |n| format("%s-0000-4000-8000-%012d", prefix, n) }
    end

    def t(value)
      value.is_a?(String) ? Time.iso8601(value).utc : value
    end

    def submitted_application(created, pct: 100, section: "review_and_sign")
      started = ExportBuilder.stage_at(created, "application")
      { started: started, submitted: started + 1.day, pct: pct, section: section }
    end

    def started_application(created, pct:, section:, started: nil)
      { started: started || ExportBuilder.stage_at(created, "application"), pct: pct, section: section }
    end

    def appointment(created, status:, at: nil)
      booked = ExportBuilder.stage_at(created, "consult")
      { booked: booked, at: at || booked + 1.day, status: status }
    end
  end
end

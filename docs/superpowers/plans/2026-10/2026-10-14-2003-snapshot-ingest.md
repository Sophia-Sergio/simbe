# Snapshot Ingest Implementation Plan

> **Detail reference, not executed directly.** The work in this plan is sliced into parallel lanes — see [`docs/superpowers/parallel/README.md`](../../parallel/README.md). Lane plans execute specific tasks of this plan with explicit overrides (data via `AlphaScenario.load!`, hooks/kit/shell from Wave 0, routes via per-lane files, contract paths per `contracts/openapi`). Where this plan differs from a lane plan or the contract, **the lane plan and `contracts/` win**.

> **For Cursor / OpenCode:** Implement task-by-task. Follow `docs/conventions/`. Stop if blocked — do not replan silently. Steps use checkbox (`- [ ]`) syntax. **Commit after every task** (`feat(ingest): task N – <title>`) after the task's checks (and `make verify` once it exists) pass.

**Goal:** Validate and atomically load an agency's seven CSV exports into agency-tagged Postgres tables, idempotently, via service, rake task and owner-only API.

**Spec:** `docs/superpowers/specs/2026-10/2026-10-14-2002-snapshot-ingest-design.md`

**Depends on:** plan `2026-10-14-2001-foundation` merged (Agency, User, Current, AgencyScoped, Api::BaseController, isolation harness). **Unblocks:** metrics, pipeline, data-sources UI.

**Architecture:** `Snapshot::Reader` parses CSVs to typed row hashes; `Snapshot::Validator` produces a report (errors/warnings/diff); `Snapshot::Importer` replaces the agency's rows inside one advisory-locked transaction and computes `lead_facts` in SQL. `SnapshotUploadsController` wraps the two-step upload/commit.

**Tech Stack:** Rails 8, Postgres 16, Active Record Encryption, Ruby `CSV`, RSpec.

## Global Constraints
- All tenant tables have `agency_id uuid NOT NULL` + index; `leads.external_id` unique per agency.
- `screener_answers.answer` encrypted (`encrypts :answer`); never logged.
- `unscoped` only under `app/services/snapshot/`.
- Re-loading the same files must leave identical row counts (no double counting).

## Review Focus
- Same file loaded twice → identical counts (spec'd in Task 5).
- CSV with BOM, CRLF line endings, or quoted commas in names → parses (Task 4).
- Blank `source`/`campaign`/`ad`/`paused_until` → NULL, never the string "".
- A failure on the last table (e.g. applications) rolls everything back, previous snapshot intact (Task 5).
- Another agency's `lead_id` in the upload → blocked, other agency untouched (Task 5).
- Two simultaneous commits → second gets 409 (Task 7).

---

## File Map

| Action | Path |
|--------|------|
| Create | `backend/db/migrate/*_create_ingest_tables.rb` |
| Create | `backend/app/models/{lead,stage_event,contact,screener_answer,web_session,appointment,application,lead_fact,snapshot,snapshot_upload}.rb` |
| Create | `backend/app/services/channels/normalizer.rb` |
| Create | `backend/app/services/snapshot/{reader,validator,importer,facts,constants}.rb` |
| Create | `backend/app/controllers/api/v1/{snapshot_uploads,snapshots}_controller.rb`, `backend/app/serializers/snapshot_serializer.rb` |
| Create | `backend/lib/tasks/snapshot.rake` |
| Create | `backend/spec/support/{export_builder.rb,alpha_scenario.rb}`, specs listed per task |
| Modify | `backend/config/routes.rb`, `backend/config/environments/*.rb` (encryption), `backend/spec/support/isolation.rb`, `.env.example` |

---

## Task 1: Schema and models

**Files:** Create migration + the ten models above; Modify `config/application.rb`.

**Interfaces — Produces:** tables/models below (all `include AgencyScoped` except `Snapshot*` which use `belongs_to :agency` explicitly):

| Table | Columns (besides `id uuid`, `agency_id`, timestamps) |
|---|---|
| `leads` | `external_id uuid NOT NULL`, `lead_created_at timestamptz NOT NULL`, `first_name`, `last_name`, `email`, `phone`, `state`, `source_raw`, `channel NOT NULL`, `campaign`, `ad`, `coordinator_name`, `current_stage NOT NULL`, `outcome NOT NULL`, `outcome_reason`, `outcome_updated_at timestamptz`, `paused_until date`. Unique `(agency_id, external_id)`; indexes on `(agency_id, channel)`, `(agency_id, coordinator_name)`, `(agency_id, outcome)` |
| `stage_events` | `lead_id uuid FK ON DELETE CASCADE`, `stage`, `entered_at`. Unique `(lead_id, stage)` |
| `contacts` | `lead_id` FK cascade, `contacted_at`, `direction`, `channel`, `contacted_by`. Unique `(lead_id, contacted_at, direction, channel)` |
| `screener_answers` | `lead_id` FK cascade, `submitted_at`, `question`, `answer` (text, encrypted), `meets_requirement` (`yes\|review\|no`). Unique `(lead_id, question)` |
| `web_sessions` | `lead_id` FK cascade, `started_at`, `landing_url`, `pages_viewed`, `referrer`, `device`. Unique `(lead_id, started_at)` |
| `appointments` | `lead_id` FK cascade, `booked_at`, `scheduled_for`, `status` (`scheduled\|attended\|no_show\|cancelled`). Unique `(lead_id, booked_at)` |
| `applications` | `lead_id` FK cascade, `started_at`, `submitted_at`, `percent_complete int`, `last_section_completed`. Unique `(lead_id, started_at)` |
| `lead_facts` | `lead_id` FK cascade **unique**, `application_submitted_at`, `consult_attended_at`, `records_at`, `accepted_at`, `furthest_stage`, `first_outbound_at`, `first_response_minutes int`, `last_contact_at`, `last_inbound_at`, `screener_met int`, `screener_review int`, `screener_not_met int`, `screener_total int` |
| `snapshots` | `agency_id`, `as_of timestamptz NOT NULL`, `loaded_at`, `row_counts jsonb`, `warnings jsonb`, `loaded_by uuid` |
| `snapshot_uploads` | `agency_id`, `user_id`, `status` (`validated\|committed\|expired`), `report jsonb`, `dir text` |

Constants in `Snapshot::Constants`: `STAGES = %w[inquiry pre_screen application consult records accepted]`, `OUTCOMES = %w[open not_eligible withdrew unresponsive paused accepted]`, `REQUIRED_FILES`, `HEADERS` (exact per file, from `harbor-takehome/exports/README.md`; leads headers: `lead_id,created_at,first_name,last_name,email,phone,state,source,campaign,ad,coordinator,current_stage,outcome,outcome_reason,outcome_updated_at,paused_until`).

- [ ] **Step 1: Failing spec** `spec/models/ingest_schema_spec.rb`
```ruby
require "rails_helper"
RSpec.describe "ingest schema" do
  let(:agency) { create(:agency) }
  before { Current.agency = agency }

  it "enforces unique external_id per agency but allows it across agencies" do
    attrs = { external_id: SecureRandom.uuid, lead_created_at: Time.current, channel: "Unknown", current_stage: "pre_screen", outcome: "open" }
    Lead.create!(attrs)
    expect { Lead.create!(attrs) }.to raise_error(ActiveRecord::RecordNotUnique)
    Current.agency = create(:agency)
    expect { Lead.create!(attrs) }.not_to raise_error
  end

  it "encrypts screener answers at rest" do
    lead = Lead.create!(external_id: SecureRandom.uuid, lead_created_at: Time.current, channel: "Unknown", current_stage: "pre_screen", outcome: "open")
    sa = ScreenerAnswer.create!(lead: lead, submitted_at: Time.current, question: "How old are you?", answer: "36", meets_requirement: "yes")
    raw = ActiveRecord::Base.connection.select_value("select answer from screener_answers where id = '#{sa.id}'")
    expect(raw).not_to eq("36")
    expect(sa.reload.answer).to eq("36")
  end
end
```
- [ ] **Step 2:** `make spec ARGS=spec/models/ingest_schema_spec.rb` → FAIL.
- [ ] **Step 3: Implement.** Migration per table above (`id: :uuid`, `t.references :agency, type: :uuid, null: false, foreign_key: true`, child `t.references :lead, type: :uuid, null: false, foreign_key: { on_delete: :cascade }`, check constraints for enums). Models: `Lead has_many :stage_events, :contacts, :screener_answers, :web_sessions, :appointments, :applications (dependent: :delete_all), has_one :lead_fact`. `ScreenerAnswer`: `encrypts :answer`. Generate dev encryption keys: `docker compose exec api bundle exec rails db:encryption:init`, put the three values in `.env` (and test keys in `config/environments/test.rb`: `config.active_record.encryption.primary_key = "test-primary"` etc.), wire `config.active_record.encryption.*` from `ENV` in `config/application.rb`.
- [ ] **Step 4:** `docker compose exec api bundle exec rails db:migrate && make spec ARGS=spec/models/ingest_schema_spec.rb` → pass. Commit.

---

## Task 2: Channel normalizer

**Files:** Create `app/services/channels/normalizer.rb`, `spec/services/channels/normalizer_spec.rb`.
**Interfaces — Produces:** `Channels::Normalizer.call(raw) → [channel, known]` (`known=false` for unmapped non-blank values); `Channels::Normalizer::CHANNELS = %w[Facebook Instagram Google TikTok Referral Unknown]`.

- [ ] **Step 1: Failing spec**
```ruby
require "rails_helper"
RSpec.describe Channels::Normalizer do
  {
    "facebook" => "Facebook", "fb" => "Facebook", "Facebook" => "Facebook", " FB " => "Facebook",
    "instagram" => "Instagram", "ig" => "Instagram", "google" => "Google", "Google" => "Google",
    "tiktok" => "TikTok", "referral" => "Referral", "" => "Unknown", nil => "Unknown"
  }.each do |raw, expected|
    it "maps #{raw.inspect} to #{expected}" do
      expect(described_class.call(raw)).to eq([expected, true])
    end
  end
  it "titleizes unknown sources and flags them" do
    expect(described_class.call("podcast")).to eq(["Podcast", false])
  end
end
```
- [ ] **Step 2:** FAIL. **Step 3: Implement**
```ruby
module Channels
  module Normalizer
    MAP = { "facebook" => "Facebook", "fb" => "Facebook", "instagram" => "Instagram", "ig" => "Instagram",
            "google" => "Google", "tiktok" => "TikTok", "referral" => "Referral" }.freeze
    CHANNELS = (MAP.values.uniq + [ "Unknown" ]).freeze
    def self.call(raw)
      key = raw.to_s.strip.downcase
      return [ "Unknown", true ] if key.empty?
      MAP.key?(key) ? [ MAP[key], true ] : [ key.titleize, false ]
    end
  end
end
```
- [ ] **Step 4:** pass. Commit.

---

## Task 3: ExportBuilder DSL and the Alpha scenario (test support)

**Files:** Create `spec/support/export_builder.rb`, `spec/support/alpha_scenario.rb`, `spec/support/export_builder_spec.rb` (excluded from the default pattern? put at `spec/support_specs/export_builder_spec.rb`).

**Interfaces — Produces:**
- `ExportBuilder.new.lead(id:, created: "2025-09-01T10:00:00.000Z", source: "", campaign: nil, ad: nil, coordinator: "Jess Kim", state: "CA", stage: "pre_screen", outcome: "open", reason: nil, paused_until: nil, history: [..stages..], outbound_at: nil|"…", inbound_at: nil, application: nil|{started:, submitted:, pct:, section: "review_and_sign"}, appointment: nil|{booked:, at:, status:}, screener: [[question, answer, "yes|review|no"]])` → chainable; `#write(dir)` writes the seven CSVs (exact headers) and returns `dir`.
- `AlphaScenario.dir(version = :v1)` builds into `Dir.mktmpdir` and memoizes; `AlphaScenario::AS_OF` = `Time.utc(2026, 10, 1, 12)`.

- [ ] **Step 1:** Implement `ExportBuilder` with Ruby `CSV.open` writing each file; every lead gets a `stage_history` row for each stage in `history` (timestamps = created + n days) and 10 screener answers by default (`"How old are you?"` etc.; use the 10 questions: age, citizenship, prior pregnancy, BMI, smoker, state of residence, support partner, income, criminal record, prior surrogacy — all `yes` unless overridden).
- [ ] **Step 2: Alpha scenario** — 10 leads, agency milestone `consult_attended`, timezone `America/Los_Angeles`. Build exactly:

| Lead | source (raw) | campaign | coord | history (stages) | application | appointment | outcome / current_stage | first outbound after created |
|---|---|---|---|---|---|---|---|---|
| L1 | facebook | c-a | Jess Kim | inquiry,pre_screen,application,consult,records,accepted | submitted 100% | attended | accepted / accepted | 30 min |
| L2 | fb | c-a | Jess Kim | inquiry,pre_screen,application,consult | submitted 100% | attended | open / consult | 60 min |
| L3 | Facebook | c-a | Dana Ortiz | inquiry,pre_screen,application,consult | submitted 100% | no_show | open / consult | 120 min |
| L4 | ig | c-b | Dana Ortiz | inquiry,pre_screen,application | started, 40%, last section `pregnancy_history`, not submitted | — | open / application | 10 min |
| L5 | google | c-c | Dana Ortiz | inquiry,pre_screen | — | — | not_eligible / pre_screen (reason `age`) | 20 min |
| L6 | Google | c-c | Priya Shah | inquiry,pre_screen | — | — | unresponsive / pre_screen | none |
| L7 | "" | — | Priya Shah | inquiry,pre_screen | — | — | open / pre_screen | none |
| L8 | referral | — | Priya Shah | inquiry,pre_screen,application,consult,records | submitted 100% | attended | open / records | 45 min |
| L9 | tiktok | c-d | Jess Kim | inquiry,pre_screen | — | — | not_eligible / pre_screen (reason `bmi`) | 15 min |
| L10 | google | c-c | Dana Ortiz | inquiry,pre_screen | — | — | paused / pre_screen, `paused_until 2026-09-20` | 25 min |

**Exact timestamps (all UTC, fixed strings):** `created` = L1 `2026-09-20T10:00:00.000Z`, L2 `09-21`, L3 `09-22`, L4 `09-23`, L5 `09-24`, L6 `09-25`, L8 `09-26`, L9 `09-27`, L10 `09-28`, L7 `09-29` (all `T10:00:00.000Z`). Stage entries: inquiry = created, pre_screen = +10 min, application = +1 day, consult = +2 days, records = +4 days, accepted = +6 days. Appointment: `booked_at` = consult entry, `scheduled_for` = booked + 1 day, **except L3** whose `scheduled_for` = `2026-09-28T16:00:00.000Z` (no_show). Application: `started_at` = application entry, `submitted_at` = started + 1 day when submitted. First outbound contact = created + the minutes in the table (a single `outbound text` row); L4's only contact is that one. **L6's `outcome_updated_at` = `2026-10-01T12:00:00.000Z`** — the latest timestamp in the export — so `as_of` = `AlphaScenario::AS_OF` = `2026-10-01T12:00:00Z` (as_of is the max timestamp across files). Every other `outcome_updated_at` is blank except L1 (`2026-09-26T10:00:00.000Z`, accepted), L5 and L9 (their created + 1 day). `:v2` = v1 plus L11 (google, c-c, Jess Kim, pre_screen, open; created `2026-10-02T10:00:00.000Z`, outbound +30 min), L12 (facebook, c-a, Dana Ortiz, application stage + application started and 20% complete, open; created `2026-10-03T06:00:00.000Z`, outbound +20 min), L4 moved to consult (history + consult at `2026-10-02T09:00:00.000Z`, appointment status `scheduled`, `scheduled_for` `2026-10-06T16:00:00.000Z`), and L6's `outcome_updated_at` = `2026-10-03T12:00:00.000Z` (v2 `as_of`).
Document the **derived truths** in a comment block at the top of `alpha_scenario.rb` (later plans assert them): leads 10; qualified (consult_attended) = L1,L2,L8 = **3**; qualified (records) = L1,L8 = 2; (application_submitted) = L1,L2,L3,L8 = 4; (accepted) = L1 = 1. Channels (leads/qualified): Facebook 3/2, Instagram 1/0, Google 3/0, Referral 1/1, TikTok 1/0, Unknown 1/0. Funnel reached: inquiry 10, application 5, consult booked 4, attended 3, records 2, accepted 1.
- [ ] **Step 3: Self-test spec**: `AlphaScenario.dir` contains 7 files, `leads.csv` has 10 data rows, headers match `Snapshot::Constants::HEADERS`.
- [ ] **Step 4:** `make spec ARGS=spec/support_specs` → pass. Commit.

---

## Task 4: Reader + Validator

**Files:** Create `app/services/snapshot/{constants,reader,validator}.rb`, `spec/services/snapshot/validator_spec.rb`.

**Interfaces — Produces:**
- `Snapshot::Reader.call(dir) → Snapshot::Data` (Struct with `files: Hash[name → Array<Hash>]`, parse errors collected as `errors: [{file:, row:, code:, message:}]`; handles BOM and CRLF via `CSV.foreach(path, headers: true, encoding: "bom|utf-8")`; blank strings → nil; timestamps via `Time.iso8601`; `paused_until` → Date; `percent_complete` → Integer).
- `Snapshot::Validator.call(agency:, dir:) → Hash` report: `{ ok: bool, errors: [{code:, file:, row:, message:}], warnings: [{code:, count:, message:}], diff: { leads: {current:, incoming:, delta:}, <table>: {…} }, checks: { files_matched: "7 of 7", duplicates: 0, screener_encrypted: true }, as_of: iso8601 }`.
Error codes: `missing_file`, `bad_headers`, `bad_value`, `duplicate_key`, `orphan_row`, `agency_mismatch`, `foreign_lead`. Warning codes: `stage_mismatch`, `unknown_source`, `duplicate_email`, `source_aliases_normalized`.

- [ ] **Step 1: Failing spec** (each case builds a variant of Alpha via `ExportBuilder`/file edits in a tmpdir):
```ruby
require "rails_helper"
RSpec.describe Snapshot::Validator do
  let(:agency) { create(:agency, slug: "alpha") }
  let(:dir) { AlphaScenario.copy_dir } # fresh tmp copy of v1 each call

  it "accepts the Alpha export" do
    report = described_class.call(agency: agency, dir: dir)
    expect(report[:ok]).to be(true)
    expect(report[:diff][:leads]).to eq(current: 0, incoming: 10, delta: 10)
    expect(report[:as_of]).to be_present
  end

  it "reports a missing file" do
    File.delete(File.join(dir, "appointments.csv"))
    expect(described_class.call(agency: agency, dir: dir)[:errors].map { _1[:code] }).to include("missing_file")
  end

  it "rejects wrong headers" do
    path = File.join(dir, "leads.csv"); File.write(path, File.read(path).sub("lead_id", "id"))
    expect(described_class.call(agency: agency, dir: dir)[:errors].map { _1[:code] }).to include("bad_headers")
  end

  it "rejects duplicate natural keys and orphan rows" do
    path = File.join(dir, "stage_history.csv"); rows = File.readlines(path)
    File.write(path, (rows + [rows[1], "00000000-0000-0000-0000-000000000000,inquiry,2026-09-01T00:00:00.000Z\n"]).join)
    codes = described_class.call(agency: agency, dir: dir)[:errors].map { _1[:code] }
    expect(codes).to include("duplicate_key", "orphan_row")
  end

  it "rejects unparseable timestamps with the row number" do
    path = File.join(dir, "leads.csv"); File.write(path, File.read(path).sub(/2026-09-2\dT[\d:.]+Z/, "yesterday"))
    err = described_class.call(agency: agency, dir: dir)[:errors].find { _1[:code] == "bad_value" }
    expect(err).to include(file: "leads.csv")
    expect(err[:row]).to be_a(Integer)
  end

  it "blocks lead_ids that belong to another agency" do
    other = create(:agency)
    Snapshot::Importer.call(agency: other, dir: dir)
    expect(described_class.call(agency: agency, dir: dir)[:errors].map { _1[:code] }).to include("foreign_lead")
  end

  it "requires >=50% overlap with an agency's existing leads" do
    Snapshot::Importer.call(agency: agency, dir: dir)
    other_dir = AlphaScenario.copy_dir(:other_leads) # 10 completely different lead ids
    expect(described_class.call(agency: agency, dir: other_dir)[:errors].map { _1[:code] }).to include("agency_mismatch")
  end

  it "warns on stage mismatch, unknown source and normalized aliases" do
    path = File.join(dir, "leads.csv"); File.write(path, File.read(path).sub(",ig,", ",podcast,"))
    codes = described_class.call(agency: agency, dir: dir)[:warnings].map { _1[:code] }
    expect(codes).to include("unknown_source", "source_aliases_normalized")
  end
end
```
Add `AlphaScenario.copy_dir(variant = :v1)` (fresh tmp copy; `:other_leads` = same shape, all new UUIDs).
- [ ] **Step 2:** FAIL. **Step 3: Implement** Reader then Validator following the spec's decision 7. Cross-agency check: `Lead.unscoped.where.not(agency_id: agency.id).where(external_id: incoming_ids).exists?` → `foreign_lead` (this is the only place besides the Importer that may call `unscoped`). Overlap: `current = Lead.unscoped.where(agency_id: agency.id).pluck(:external_id)`; skip when empty. `as_of` = max of every timestamp column across files, never later than `Time.current`.
- [ ] **Step 4:** `make spec ARGS=spec/services/snapshot/validator_spec.rb` → pass (the two tests that need the Importer pass after Task 5; mark them `pending "needs Importer (task 5)"` now and remove the pending in Task 5). Commit.

---

## Task 5: Importer, facts, idempotency

**Files:** Create `app/services/snapshot/{importer,facts}.rb`, `spec/services/snapshot/importer_spec.rb`.
**Interfaces — Produces:** `Snapshot::Importer.call(agency:, dir:, user: nil) → Snapshot` (raises `Snapshot::InProgress` when the advisory lock is held, `Snapshot::Invalid` carrying the report when validation has errors). Sets `lead_facts`. `Snapshot::Facts.call(agency_id)` runs the SQL below.

- [ ] **Step 1: Failing spec**
```ruby
require "rails_helper"
RSpec.describe Snapshot::Importer do
  let(:agency) { create(:agency, slug: "alpha", timezone: "America/Los_Angeles", qualified_milestone: "consult_attended") }
  before { Current.agency = agency }
  let(:dir) { AlphaScenario.copy_dir }

  def counts = %w[leads stage_events contacts screener_answers web_sessions appointments applications lead_facts].index_with { |t| ActiveRecord::Base.connection.select_value("select count(*) from #{t} where agency_id = '#{agency.id}'").to_i }

  it "loads Alpha with normalized channels and an as_of" do
    snap = described_class.call(agency: agency, dir: dir)
    expect(counts["leads"]).to eq(10)
    expect(Lead.group(:channel).count).to include("Facebook" => 3, "Instagram" => 1, "Google" => 3, "Referral" => 1, "TikTok" => 1, "Unknown" => 1)
    expect(Lead.find_by(source_raw: nil).channel).to eq("Unknown")
    expect(snap.as_of).to be <= Time.current
  end

  it "computes lead_facts" do
    described_class.call(agency: agency, dir: dir)
    l1 = Lead.find_by!(first_name: "L1") # ExportBuilder names leads L1..L10 in first_name
    f = l1.lead_fact
    expect(f.consult_attended_at).to be_present
    expect(f.application_submitted_at).to be_present
    expect(f.accepted_at).to be_present
    expect(f.furthest_stage).to eq("accepted")
    expect(f.first_response_minutes).to eq(30)
    expect(Lead.find_by!(first_name: "L7").lead_fact.first_outbound_at).to be_nil
    expect(Lead.find_by!(first_name: "L3").lead_fact.consult_attended_at).to be_nil # no_show
  end

  it "is idempotent: loading the same snapshot twice keeps the same counts" do
    described_class.call(agency: agency, dir: dir)
    first = counts
    described_class.call(agency: agency, dir: dir)
    expect(counts).to eq(first)
    expect(Snapshot.where(agency_id: agency.id).count).to eq(2)
  end

  it "replaces with a newer snapshot (v2 adds 2 leads, moves L4)" do
    described_class.call(agency: agency, dir: dir)
    described_class.call(agency: agency, dir: AlphaScenario.copy_dir(:v2))
    expect(counts["leads"]).to eq(12)
    expect(Lead.find_by!(first_name: "L4").current_stage).to eq("consult")
  end

  it "rolls back completely when a later table fails" do
    described_class.call(agency: agency, dir: dir)
    bad = AlphaScenario.copy_dir(:v2)
    File.write(File.join(bad, "applications.csv"), File.read(File.join(bad, "applications.csv")).sub(/,100,/, ",not-a-number,"))
    expect { described_class.call(agency: agency, dir: bad) }.to raise_error(Snapshot::Invalid)
    expect(counts["leads"]).to eq(10)
  end

  it "keeps another agency's data untouched" do
    other = create(:agency); Current.agency = other
    described_class.call(agency: other, dir: AlphaScenario.copy_dir(:other_leads))
    Current.agency = agency
    described_class.call(agency: agency, dir: dir)
    Current.agency = other
    expect(Lead.count).to eq(10)
    Current.agency = agency
    expect(Lead.count).to eq(10)
  end

  it "raises InProgress when another load holds the advisory lock" do
    key = Snapshot::Importer.lock_key(agency)
    ActiveRecord::Base.connection.execute("select pg_advisory_lock(#{key})")
    Thread.new { expect { described_class.call(agency: agency, dir: dir) }.to raise_error(Snapshot::InProgress) }.join
  ensure
    ActiveRecord::Base.connection.execute("select pg_advisory_unlock(#{key})")
  end
end
```
Update `ExportBuilder` so `first_name` = `"L#{n}"`, `last_name` = `"Alpha"`.
- [ ] **Step 2:** FAIL. **Step 3: Implement**
  - Lock: `ActiveRecord::Base.connection.select_value("select pg_try_advisory_xact_lock(#{key})")` inside the transaction (`key = agency.id.delete("-")[0,15].to_i(16)`); false → `raise InProgress`.
  - Pipeline: `report = Validator.call(...)`; `raise Invalid.new(report) unless report[:ok]`. Then `Lead.unscoped.where(agency_id: agency.id).delete_all` (children cascade), bulk insert each table with `insert_all` in 5,000-row slices, mapping `external_id → lead id` via a Hash built from `Lead.unscoped.where(agency_id:).pluck(:external_id, :id)`; screener rows built through `ScreenerAnswer.new(...).attributes`-style so `encrypts` applies (use `ActiveRecord::Encryption.encryptor.encrypt(answer)` explicitly when using `insert_all`, and a spec in Task 1 already proves round-trip).
  - `Snapshot::Facts.call(agency_id)` — `INSERT INTO lead_facts (…) SELECT …` with per-lead aggregates: `max(applications.submitted_at)`, `min(appointments.scheduled_for) filter (where status = 'attended')`, `stage_events` for records/accepted, furthest stage via `array_position(ARRAY['inquiry','pre_screen','application','consult','records','accepted'], stage)` max, `min(contacts.contacted_at) filter (where direction='outbound')`, `first_response_minutes = round(extract(epoch from first_outbound_at - lead_created_at)/60)`, `max(contacts.contacted_at)`, `max(...) filter (where direction='inbound')`, screener counts by `meets_requirement` (`yes`→met, `review`, `no`→not_met). All keyed by `agency_id` bind param.
  - Insert the `snapshots` row with `row_counts`, `warnings` (from the report), `as_of`, `loaded_by`.
  - Everything inside `ActiveRecord::Base.transaction`. Remove the `pending` markers in `validator_spec.rb`.
- [ ] **Step 4:** `make spec ARGS=spec/services/snapshot` → all pass. Commit.

---

## Task 6: Rake task and real-data load

**Files:** Create `lib/tasks/snapshot.rake`.

- [ ] **Step 1:**
```ruby
namespace :snapshot do
  desc "Load an agency snapshot: rails 'snapshot:load[harbor,../harbor-takehome/exports/harbor]'"
  task :load, %i[slug dir] => :environment do |_, args|
    agency = Agency.find_by!(slug: args[:slug])
    Current.agency = agency
    snap = Snapshot::Importer.call(agency: agency, dir: File.expand_path(args[:dir], Rails.root))
    puts "loaded #{snap.row_counts.to_json} as_of=#{snap.as_of.iso8601}"
  rescue Snapshot::Invalid => e
    abort e.report[:errors].map { |x| "#{x[:file]} row #{x[:row]}: #{x[:code]} #{x[:message]}" }.first(20).join("\n")
  end
end
```
- [ ] **Step 2: Real data** (exports are git-ignored; they must be present locally). Mount them: add `../harbor-takehome:/harbor-takehome:ro` to the `api` service volumes in `docker-compose.yml`. Run, twice each:
```bash
docker compose exec api bundle exec rails "snapshot:load[harbor,/harbor-takehome/exports/harbor]"
docker compose exec api bundle exec rails "snapshot:load[lakeside,/harbor-takehome/exports/lakeside]"
docker compose exec db psql -U simbe simbe_development -c "select a.slug, (select count(*) from leads l where l.agency_id=a.id) leads, (select count(*) from screener_answers s where s.agency_id=a.id) screener from agencies a order by 1"
```
Expected: harbor 3530 / 35300; lakeside 29740 / 297400 — identical after the second run. Record load time in the PR (target < 60 s for Lakeside; if slower, switch the bulk insert to `COPY` via `connection.raw_connection.copy_data`, keeping encryption).
- [ ] **Step 3:** `docker compose exec db psql -U simbe simbe_development -c "select count(*) from screener_answers where answer ~ '^[0-9]+\$'"` → `0`. Commit.

---

## Task 7: Upload API (two-step) + isolation

**Files:** Create `app/controllers/api/v1/{snapshot_uploads,snapshots}_controller.rb`, `app/serializers/snapshot_serializer.rb`, `spec/requests/snapshot_uploads_spec.rb`; Modify `config/routes.rb`, `spec/support/isolation.rb`.

**Interfaces — Produces (owner only):**
- `POST /api/v1/snapshot_uploads` (multipart `files[]`) → `201 { id, report }`; files saved to `storage/snapshot_uploads/<id>/<basename>`; unmatched names ignored but listed in `report.ignored`.
- `POST /api/v1/snapshot_uploads/:id/commit` → `200 { snapshot }` | `422 { error:{code:"invalid_snapshot"}, report }` | `409 already_in_progress`; deletes the dir; sets status `committed`.
- `DELETE /api/v1/snapshot_uploads/:id` → 204 (cancel; removes dir).
- `GET /api/v1/snapshots/current` → `{ snapshot: { id, as_of, loaded_at, row_counts, warnings } | null, files: [{name, rows}] }` — any role (the top-bar pill needs `as_of`; coordinators get `as_of` only).

- [ ] **Step 1: Failing request spec** (key cases):
```ruby
require "rails_helper"
RSpec.describe "Snapshot uploads", type: :request do
  let(:h) { { "X-Requested-With" => "simbe" } }
  let(:agency) { create(:agency, slug: "alpha") }
  let!(:owner) { create(:user, agency: agency) }
  let!(:coordinator) { create(:user, :coordinator, agency: agency) }
  def sign_in(u) = post("/api/v1/session", params: { email: u.email, password: "secret-pass-1" }, headers: h, as: :json)
  def files(dir = AlphaScenario.copy_dir) = Dir[File.join(dir, "*.csv")].map { |f| Rack::Test::UploadedFile.new(f, "text/csv") }

  it "uploads, validates, and commits" do
    sign_in(owner)
    post "/api/v1/snapshot_uploads", params: { files: files }, headers: h
    expect(response).to have_http_status(:created)
    id = response.parsed_body["id"]
    expect(response.parsed_body.dig("report", "ok")).to be(true)
    post "/api/v1/snapshot_uploads/#{id}/commit", headers: h
    expect(response).to have_http_status(:ok)
    get "/api/v1/snapshots/current"
    expect(response.parsed_body.dig("snapshot", "row_counts", "leads")).to eq(10)
  end

  it "refuses to commit an invalid upload" do
    sign_in(owner)
    post "/api/v1/snapshot_uploads", params: { files: files.first(3) }, headers: h
    id = response.parsed_body["id"]
    post "/api/v1/snapshot_uploads/#{id}/commit", headers: h
    expect(response).to have_http_status(:unprocessable_entity)
    expect(response.parsed_body.dig("error", "code")).to eq("invalid_snapshot")
  end

  it "forbids coordinators" do
    sign_in(coordinator)
    post "/api/v1/snapshot_uploads", params: { files: files }, headers: h
    expect(response).to have_http_status(:forbidden)
  end

  it "404s another agency's upload id" do
    other = create(:user, password: "secret-pass-1")
    sign_in(other)
    post "/api/v1/snapshot_uploads", params: { files: files(AlphaScenario.copy_dir(:other_leads)) }, headers: h
    foreign_id = response.parsed_body["id"]
    sign_in(owner)
    post "/api/v1/snapshot_uploads/#{foreign_id}/commit", headers: h
    expect(response).to have_http_status(:not_found)
  end

  it "returns 409 when a commit is already running" do
    sign_in(owner)
    post "/api/v1/snapshot_uploads", params: { files: files }, headers: h
    id = response.parsed_body["id"]
    allow(Snapshot::Importer).to receive(:call).and_raise(Snapshot::InProgress)
    post "/api/v1/snapshot_uploads/#{id}/commit", headers: h
    expect(response).to have_http_status(:conflict)
    expect(response.parsed_body.dig("error", "code")).to eq("already_in_progress")
  end
end
```
- [ ] **Step 2:** FAIL. **Step 3: Implement** controllers (thin: `require_owner!` on uploads; `SnapshotUpload` is looked up through `Current.agency.snapshot_uploads.find(params[:id])` → 404 for others; `rescue_from Snapshot::InProgress` → 409; `Snapshot::Invalid` → 422 with report). Cap upload size at 250 MB total (`413 too_large`). Add `has_many :snapshot_uploads` to Agency. Expire uploads: a `rake snapshot:expire_uploads` task deletes dirs older than 24h.
- [ ] **Step 4:** Append to `ISOLATION_ROUTES`: `{ method: :post, path: "/api/v1/snapshot_uploads/:id/commit" }`, `{ method: :delete, path: "/api/v1/snapshot_uploads/:id" }`, `{ method: :get, path: "/api/v1/snapshots/current" }`, `{ method: :post, path: "/api/v1/snapshot_uploads" }`. Run `make spec ARGS="spec/requests/snapshot_uploads_spec.rb spec/isolation"` → pass. Run `docker compose exec api bundle exec rails boundaries:check` → ok.
- [ ] **Step 5:** `make verify` → exit 0. Commit; open PR.

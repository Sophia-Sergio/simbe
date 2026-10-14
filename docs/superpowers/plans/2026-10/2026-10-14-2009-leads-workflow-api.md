# Leads Workflow — API Implementation Plan

> **For Cursor / OpenCode:** Implement task-by-task. Follow `docs/conventions/` (especially `multi-tenancy.md`, `sensitive-data.md`, `controllers.md`). Stop if blocked — do not replan silently. Steps use checkbox (`- [ ]`) syntax. **Commit after every task** (`feat(leads-api): task N – <title>`) after `make verify`.

**Goal:** Role-scoped endpoints for the pipeline board/list, lead detail, next-action queues with done toggles, coordinator stats and search.

**Spec:** `docs/superpowers/specs/2026-10/2026-10-14-2008-leads-workflow-design.md`

**Depends on:** `2026-10-14-2001-foundation` and `2026-10-14-2003-snapshot-ingest` merged (Alpha scenario incl. exact timestamps, `lead_facts`). **Unblocks:** `2026-10-14-2010-leads-workflow-ui`, agent tools.

**Architecture:** `Leads::Access` scopes by role; `Leads::Queues` is the single SQL source of queue membership (reused by board, next actions, coordinator stats, status); serializers shape JSON; thin controllers.

**Tech Stack:** Rails 8, Postgres 16 (lateral joins, window functions), RSpec.

## Global Constraints
- Coordinators only ever see `leads.coordinator_name = user.coordinator_name`; everything else → 404.
- Raw screener answers appear only for the assigned coordinator (plus `age` for both roles). Phone masked except for the assigned coordinator.
- "Now" is `snapshot.as_of`.
- New routes are added to `ISOLATION_ROUTES`.

## Review Focus
- Coordinator user with a `coordinator_name` that matches no leads → empty lists, not errors.
- Lead with no appointments / no application / no contacts → detail renders (nil-safe `process`, `activity`).
- Done toggle twice (POST POST) and undo twice (DELETE DELETE) stay idempotent.
- Phone with unusual formats (`555-0183-1768`, blank) masks without raising.
- `q` containing `%`/`_`/quotes is escaped (no SQL injection or wildcard leak).

---

## File Map

| Action | Path |
|--------|------|
| Create | `backend/db/migrate/*_create_action_completions.rb`, `backend/app/models/action_completion.rb` |
| Create | `backend/app/services/leads/{access,queues,board,list,detail,status,summarizer,masking,next_actions,coordinator_stats}.rb` |
| Create | `backend/app/serializers/{lead_card,lead_detail,next_actions,coordinator}_serializer.rb` |
| Create | `backend/app/controllers/api/v1/{leads,next_actions,completions,coordinators}_controller.rb` |
| Modify | `backend/config/routes.rb`, `backend/spec/support/isolation.rb` |
| Create | `backend/spec/services/leads/*_spec.rb`, `backend/spec/requests/{leads,next_actions,coordinators}_spec.rb`, `backend/spec/privacy/privacy_spec.rb` |

---

## Task 1: Access scope and queue SQL

**Files:** Create `app/services/leads/{access,queues}.rb`, `spec/services/leads/queues_spec.rb`.
**Interfaces — Produces:**
```ruby
Leads::Access.relation(user) # => Lead relation (owner: all in agency; coordinator: where(coordinator_name: user.coordinator_name))
Leads::Queues.call(agency:, coordinator: nil, as_of: nil) # => Array<Hash> rows:
# { lead_id:, external_id:, name:, queue: "text_back_now|nudge_applications|rebook_consults|paused_due_back",
#   age_minutes: Integer, reason: String, coordinator_name: String }  ordered by age_minutes desc
Leads::Queues::KEYS # %w[text_back_now nudge_applications rebook_consults paused_due_back]
```
`as_of` defaults to the agency's latest snapshot `as_of` (no snapshot → `[]`).

- [ ] **Step 1: Failing spec** (Alpha v1, as_of 2026-10-01T12:00Z):
```ruby
require "rails_helper"
RSpec.describe Leads::Queues do
  let(:agency) { create(:agency, slug: "alpha", timezone: "America/Los_Angeles") }
  before { Current.agency = agency; Snapshot::Importer.call(agency: agency, dir: AlphaScenario.copy_dir) }

  it "assigns each queued lead to exactly one queue" do
    rows = described_class.call(agency: agency)
    expect(rows.to_h { [_1[:name], _1[:queue]] }).to eq(
      "L4 Alpha" => "nudge_applications", "L3 Alpha" => "rebook_consults",
      "L7 Alpha" => "text_back_now", "L10 Alpha" => "paused_due_back")
  end

  it "computes ages from the snapshot as_of and orders oldest first" do
    rows = described_class.call(agency: agency)
    expect(rows.find { _1[:name] == "L7 Alpha" }[:age_minutes]).to eq(2 * 24 * 60 + 2 * 60) # created 09-29T10:00Z
    expect(rows.map { _1[:age_minutes] }).to eq(rows.map { _1[:age_minutes] }.sort.reverse)
  end

  it "writes readable reasons" do
    by = described_class.call(agency: agency).index_by { _1[:name] }
    expect(by["L7 Alpha"][:reason]).to eq("New lead · no message sent yet")
    expect(by["L4 Alpha"][:reason]).to match(/Application 40% · quiet 8d/)
    expect(by["L3 Alpha"][:reason]).to match(/No-show Sep 28 · not rebooked/)
    expect(by["L10 Alpha"][:reason]).to match(/Paused until Sep 20 · due back/)
  end

  it "filters by coordinator" do
    expect(described_class.call(agency: agency, coordinator: "Priya Shah").map { _1[:name] }).to eq(["L7 Alpha"])
  end

  it "excludes closed, accepted and already-attended leads and returns [] without a snapshot" do
    names = described_class.call(agency: agency).map { _1[:name] }
    expect(names).not_to include("L1 Alpha", "L5 Alpha", "L6 Alpha", "L2 Alpha", "L8 Alpha")
    expect(described_class.call(agency: create(:agency))).to eq([])
  end

  it "moves a nudged lead out of the queue when contacted within 24h" do
    Contact.create!(lead: Lead.find_by!(first_name: "L4"), contacted_at: Time.utc(2026, 10, 1, 9), direction: "outbound", channel: "text", contacted_by: "Dana Ortiz")
    LeadFact.find_by!(lead: Lead.find_by!(first_name: "L4")).update!(last_contact_at: Time.utc(2026, 10, 1, 9))
    expect(described_class.call(agency: agency).map { _1[:name] }).not_to include("L4 Alpha")
  end
end
```
(ExportBuilder names: `first_name "L4"`, `last_name "Alpha"` → full name `"L4 Alpha"`.)
- [ ] **Step 2:** FAIL. **Step 3: Implement** `Leads::Queues` with one SQL string (bind `:agency_id,:as_of,:as_of_date,:coordinator`):
```sql
WITH base AS (
  SELECT l.id, l.external_id, l.first_name || ' ' || l.last_name AS name, l.lead_created_at, l.current_stage, l.outcome,
         l.paused_until, l.coordinator_name, f.first_outbound_at, f.last_contact_at,
         ap.started_at AS app_started_at, ap.submitted_at AS app_submitted_at, ap.percent_complete, ap.last_section_completed,
         pa.status AS appt_status, pa.scheduled_for AS appt_at
  FROM leads l
  JOIN lead_facts f ON f.lead_id = l.id
  LEFT JOIN LATERAL (SELECT * FROM applications a WHERE a.lead_id = l.id ORDER BY a.started_at DESC LIMIT 1) ap ON true
  LEFT JOIN LATERAL (SELECT * FROM appointments p WHERE p.lead_id = l.id ORDER BY p.booked_at DESC LIMIT 1) pa ON true
  WHERE l.agency_id = :agency_id AND (:coordinator::text IS NULL OR l.coordinator_name = :coordinator)
), queued AS (
  SELECT *, CASE
    WHEN outcome = 'open' AND first_outbound_at IS NULL THEN 'text_back_now'
    WHEN outcome = 'open' AND current_stage = 'application' AND app_started_at IS NOT NULL AND app_submitted_at IS NULL
         AND (last_contact_at IS NULL OR last_contact_at < :as_of::timestamptz - interval '24 hours') THEN 'nudge_applications'
    WHEN outcome = 'open' AND appt_status = 'no_show' THEN 'rebook_consults'
    WHEN outcome = 'paused' AND paused_until <= :as_of_date::date THEN 'paused_due_back'
  END AS queue
  FROM base
)
SELECT id, external_id, name, queue, coordinator_name, percent_complete, last_section_completed, appt_at, paused_until,
  (extract(epoch FROM (CASE queue
     WHEN 'text_back_now' THEN :as_of::timestamptz - lead_created_at
     WHEN 'nudge_applications' THEN :as_of::timestamptz - coalesce(last_contact_at, app_started_at)
     WHEN 'rebook_consults' THEN :as_of::timestamptz - appt_at
     ELSE :as_of::timestamptz - paused_until::timestamptz END)) / 60)::int AS age_minutes
FROM queued WHERE queue IS NOT NULL ORDER BY age_minutes DESC
```
Build `reason` in Ruby from the columns (agency tz for dates via `in_time_zone`; `quiet Nd` = age_minutes / 1440). `Leads::Access.relation`: owner → `Lead.all`; coordinator → `Lead.where(coordinator_name: user.coordinator_name)`.
- [ ] **Step 4:** `make spec ARGS=spec/services/leads/queues_spec.rb` → pass. Commit.

---

## Task 2: Status, board, list, search

**Files:** Create `app/services/leads/{status,board,list}.rb`, `app/serializers/lead_card_serializer.rb`, specs.
**Interfaces — Produces:**
- `Leads::Status.call(outcome:, queue:) → { key:, label:, tone: }` — keys: `text_back_now`(danger "Text back now"), `nudge`(warning "Nudge"), `rebook`(warning "Rebook"), `due_back`(neutral "Due back"), `on_track`(success "On track"), `accepted`(success "Accepted"), `paused`(neutral "Paused"), `not_eligible`(neutral "Not eligible"), `withdrew`(neutral "Withdrew"), `unresponsive`(danger "Unresponsive").
- `Leads::Board.call(user:, coordinator: nil) → { columns: { action_needed:, in_application:, consult:, qualified: }  each { count:, leads: [LeadCard] (≤25) } }`.
- `Leads::List.call(user:, status: "open", coordinator: nil, q: nil, cursor: nil, per: 50) → { leads: [LeadCard], next_cursor: }`.
- `LeadCard` JSON: `{ id, name, channel, status: {key,label,tone}, state, age, date (lead_created_at ISO), coordinator, stage, segments: [..6..] }` where `age` is the age in years from the `How old are you?` answer (nil if missing; **only that question is decrypted**).

Board SQL: reuse the `queued` CTE (extract it as `Leads::Queues::SQL_CTE`), add:
```sql
SELECT id, col, row_number() OVER (PARTITION BY col ORDER BY sort_at DESC) rn, count(*) OVER (PARTITION BY col) cnt
FROM (SELECT q.*, CASE
  WHEN q.outcome IN ('open','accepted') AND f.%<qcol>s IS NOT NULL THEN 'qualified'
  WHEN q.queue IS NOT NULL OR (q.outcome = 'open' AND q.current_stage IN ('inquiry','pre_screen')) THEN 'action_needed'
  WHEN q.outcome = 'open' AND q.current_stage = 'application' THEN 'in_application'
  WHEN q.outcome = 'open' AND q.current_stage = 'consult' THEN 'consult' END AS col,
  coalesce(q.last_contact_at, q.lead_created_at) AS sort_at
  FROM queued q JOIN lead_facts f ON f.lead_id = q.id) t
WHERE col IS NOT NULL AND rn <= 25
```
(`%<qcol>s` from `Metrics::Base::QUALIFIED_COLUMNS` — if the metrics plan is not merged, define the whitelist in `Leads::Constants` and have Metrics reuse it later; coordinate: put it in `app/services/agency_milestones.rb` as `AgencyMilestones::COLUMNS` and make both use it.)
Segments: from `lead_facts.furthest_stage` index `i` in `Snapshot::Constants::STAGES`: positions `< i` → `"done"`, `== i` → `"action"` if queued, `"closed"` if outcome closed (`not_eligible|withdrew|unresponsive`), else `"current"`; `> i` → `"todo"`.

- [ ] **Step 1: Failing specs**
```ruby
RSpec.describe Leads::Board do
  let(:agency) { create(:agency, slug: "alpha", qualified_milestone: "consult_attended") }
  let!(:owner) { create(:user, agency: agency) }
  let!(:dana)  { create(:user, :coordinator, agency: agency, coordinator_name: "Dana Ortiz") }
  before { Current.agency = agency; Snapshot::Importer.call(agency: agency, dir: AlphaScenario.copy_dir) }

  it "places every board lead in one column" do
    cols = described_class.call(user: owner)[:columns]
    expect(cols.transform_values { _1[:count] }).to eq(action_needed: 4, in_application: 0, consult: 0, qualified: 3)
    expect(cols[:qualified][:leads].map { _1[:name] }).to match_array(["L1 Alpha", "L2 Alpha", "L8 Alpha"])
  end
  it "re-columns when the qualified definition changes" do
    agency.update!(qualified_milestone: "records")
    cols = described_class.call(user: owner)[:columns]
    expect(cols[:qualified][:count]).to eq(2)           # L1, L8
    expect(cols[:consult][:count]).to eq(1)              # L2 now just open at consult
  end
  it "scopes a coordinator to their own leads" do
    cols = described_class.call(user: dana)[:columns]
    expect(cols.values.flat_map { _1[:leads] }.map { _1[:name] }).to match_array(["L3 Alpha", "L4 Alpha", "L10 Alpha"])
  end
  it "builds a 6-segment bar" do
    card = described_class.call(user: owner)[:columns][:action_needed][:leads].find { _1[:name] == "L4 Alpha" }
    expect(card[:segments]).to eq(%w[done done action todo todo todo])
  end
  it "returns the lead's age from the screener without exposing other answers" do
    card = described_class.call(user: owner)[:columns][:qualified][:leads].first
    expect(card.keys).not_to include(:answers)
    expect(card[:age]).to be_a(Integer)
  end
end
RSpec.describe Leads::List do
  # status filter, q search ("l4", "%" literal, email), coordinator filter, cursor paging (per: 3 → next_cursor present, second page no overlap)
end
```
- [ ] **Step 2:** FAIL; **Step 3:** implement; escape `q` with `ActiveRecord::Base.sanitize_sql_like`. **Step 4:** pass. Commit.

---

## Task 3: Lead detail (masking, screener, activity, summary)

**Files:** Create `app/services/leads/{detail,masking,summarizer}.rb`, `app/serializers/lead_detail_serializer.rb`, `spec/services/leads/detail_spec.rb`.
**Interfaces — Produces:** `Leads::Detail.call(user:, id:) → Hash` (raises `ActiveRecord::RecordNotFound` if outside the user's scope) with keys `id, name, coordinator, stage, status, contact: { state, email, phone, age, channel, campaign }, consult: { status, scheduled_for }, screener: { counts: {met, review, not_met, unanswered, total}, items: [{ question, verdict, answer? }] }, process: [{ key, label, state, detail }], activity: [{ at, kind, title, detail }], source: { channel, campaign, ad, first_visit, pages_viewed, self_reported: nil }, summary: { text, next_step }, queue: key|nil, done: bool`. `Leads::Masking.phone(raw) → "•••-••••-1768"` (last 4 digits, `nil` for blank).
Verdicts: `yes→met`, `review→review`, `no→not_met`, missing → `unanswered`. `total` = number of distinct questions in the agency's `screener_answers` (cap 10, ordered by frequency). `answer` only when `user.coordinator? && lead.coordinator_name == user.coordinator_name`.
Process states: Screener `complete` when ≥1 answer and no `no` verdicts else `stopped` when closed with `not_eligible`; Application: `complete` (submitted), `ongoing` (started, `current_stage = application`), `stopped` if closed, else `upcoming`; Consult: `complete` (attended), `ongoing` (booked/scheduled/no_show and open), `stopped` closed, `upcoming`; Medical records: `complete`/`ongoing` (stage records)/`upcoming`; Accepted: `complete` when accepted. `detail` strings like `"Submitted Sep 24"`, `"40% · stopped at pregnancy history"`.
Summarizer: deterministic text: `"<First> reached <furthest stage label> on <date>. <state-specific sentence>"` and `next_step` from the queue (`text_back_now` → "Text her back now — no message has been sent.", `nudge_applications` → "Nudge her to finish the application (<pct>% complete).", `rebook_consults` → "Offer a new consult time.", `paused_due_back` → "Reach out — her return date has passed.", else `"No action needed right now."`).

- [ ] **Step 1: Failing spec**
```ruby
it "masks the phone for the owner and shows it to the assigned coordinator" do
  l4 = Lead.find_by!(first_name: "L4")
  owner_view = described_class.call(user: owner, id: l4.id)
  expect(owner_view[:contact][:phone]).to match(/\A•••-••••-\d{4}\z/)
  dana_view = described_class.call(user: dana, id: l4.id)
  expect(dana_view[:contact][:phone]).to eq(l4.phone)
end
it "shows raw answers only to the assigned coordinator" do
  l4 = Lead.find_by!(first_name: "L4")
  expect(described_class.call(user: owner, id: l4.id)[:screener][:items].first.keys).not_to include(:answer)
  expect(described_class.call(user: dana, id: l4.id)[:screener][:items].first).to include(:answer)
end
it "404s a lead outside the coordinator's scope" do
  other = Lead.find_by!(first_name: "L1") # Jess Kim
  expect { described_class.call(user: dana, id: other.id) }.to raise_error(ActiveRecord::RecordNotFound)
end
it "builds counts, process and a newest-first activity timeline" do
  d = described_class.call(user: owner, id: Lead.find_by!(first_name: "L4").id)
  expect(d[:screener][:counts]).to eq(met: 10, review: 0, not_met: 0, unanswered: 0, total: 10)
  expect(d[:process].map { [_1[:key], _1[:state]] }).to eq([["screener","complete"],["application","ongoing"],["consult","upcoming"],["records","upcoming"],["accepted","upcoming"]])
  expect(d[:activity].map { _1[:at] }).to eq(d[:activity].map { _1[:at] }.sort.reverse)
  expect(d[:summary][:next_step]).to match(/finish the application/)
end
it "renders a lead with no appointment, application or contacts" do
  expect { described_class.call(user: owner, id: Lead.find_by!(first_name: "L7").id) }.not_to raise_error
end
it "does not log or leak answers" do
  expect(described_class.call(user: owner, id: Lead.find_by!(first_name: "L4").id).to_json).not_to match(/"answer"/)
end
```
- [ ] **Step 2:** FAIL; **Step 3:** implement (preload children in 6 queries max; spec `expect { }.to make_database_queries(count: 0..12)` guard). **Step 4:** pass. Commit.

---

## Task 4: Next actions and completions

**Files:** Create migration + `app/models/action_completion.rb`, `app/services/leads/next_actions.rb`, `app/serializers/next_actions_serializer.rb`, `spec/services/leads/next_actions_spec.rb`.
**Interfaces — Produces:**
- Table `action_completions(id uuid, agency_id, user_id, lead_external_id uuid, queue text, snapshot_as_of timestamptz, completed_at)`; unique `(agency_id, user_id, lead_external_id, queue, snapshot_as_of)`; `ActionCompletion include AgencyScoped`.
- `Leads::NextActions.call(user:, coordinator: nil) → { as_of:, progress: {done:, total:}, queues: [{ key:, title:, hint:, tone:, count:, items: [{ lead_id:, name:, age_minutes:, age_label:, reason:, done: }] }] }` — always 4 queues in fixed order; `count` = not-done items; `progress.total` = all items; items ordered by age desc; `age_label`: `<60m → "38m"`, `<24h → "5h"`, else `"2d"`.
- `Leads::NextActions.complete!(user:, lead_id:, queue:)` / `.undo!(user:, lead_id:, queue:)` — validate the lead is currently in that queue for the user's scope (else `RecordNotFound`); idempotent.

- [ ] **Step 1: Failing spec**
```ruby
it "returns four queues in order with counts and progress" do
  r = described_class.call(user: owner)
  expect(r[:queues].map { _1[:key] }).to eq(%w[text_back_now nudge_applications rebook_consults paused_due_back])
  expect(r[:queues].map { _1[:count] }).to eq([1, 1, 1, 1])
  expect(r[:progress]).to eq(done: 0, total: 4)
  expect(r[:queues].first[:items].first).to include(name: "L7 Alpha", age_label: "2d", done: false)
end
it "scopes a coordinator" do
  expect(described_class.call(user: dana)[:queues].sum { _1[:items].size }).to eq(3) # L3, L4, L10
end
it "completes and undoes idempotently" do
  l7 = Lead.find_by!(first_name: "L7")
  2.times { described_class.complete!(user: owner, lead_id: l7.id, queue: "text_back_now") }
  r = described_class.call(user: owner)
  expect(r[:progress]).to eq(done: 1, total: 4)
  expect(r[:queues].first[:count]).to eq(0)
  expect(ActionCompletion.count).to eq(1)
  2.times { described_class.undo!(user: owner, lead_id: l7.id, queue: "text_back_now") }
  expect(described_class.call(user: owner)[:progress][:done]).to eq(0)
end
it "rejects completing a lead that is not in that queue" do
  expect { described_class.complete!(user: owner, lead_id: Lead.find_by!(first_name: "L1").id, queue: "text_back_now") }.to raise_error(ActiveRecord::RecordNotFound)
end
it "resets when a newer snapshot is loaded" do
  described_class.complete!(user: owner, lead_id: Lead.find_by!(first_name: "L7").id, queue: "text_back_now")
  Snapshot::Importer.call(agency: agency, dir: AlphaScenario.copy_dir(:v2))
  expect(described_class.call(user: owner)[:progress][:done]).to eq(0)
end
```
(Coordinators complete only their own leads: add `expect { complete!(user: dana, lead_id: <L7 of Priya>, …) }.to raise_error(ActiveRecord::RecordNotFound)`.)
- [ ] **Step 2:** FAIL; **Step 3:** implement via `Leads::Queues` + `ActionCompletion.where(user_id:, snapshot_as_of: as_of)`. **Step 4:** pass. Commit.

---

## Task 5: Coordinator stats

**Files:** Create `app/services/leads/coordinator_stats.rb`, `app/serializers/coordinator_serializer.rb`, `spec/services/leads/coordinator_stats_spec.rb`.
**Interfaces — Produces:** `Leads::CoordinatorStats.call(agency:) → [{ name:, leads:, share_pct:, first_reply_minutes:, qualified:, qualified_rate:, overdue:, status: "needs_support|on_track" }]` (sorted by leads desc) and `.detail(agency:, name:) → { **row, kpis: { leads:, qualified:, qualified_rate:, first_reply_minutes: }, needs_action: [queue row hashes] }` (unknown name → `RecordNotFound`). `NEEDS_SUPPORT_THRESHOLD = 8`.
`first_reply_minutes` = median of `lead_facts.first_response_minutes` (`percentile_cont(0.5)`), `overdue` = queue rows (queues 1–3) with `age_minutes > 1440` per coordinator; qualified under the agency milestone.

- [ ] **Step 1: Failing spec** (Alpha, milestone consult_attended):
```ruby
it "summarizes each coordinator" do
  rows = described_class.call(agency: agency).index_by { _1[:name] }
  expect(rows["Dana Ortiz"]).to include(leads: 4, share_pct: 40.0, qualified: 0, overdue: 2) # L4 nudge 8d, L3 rebook 3d
  expect(rows["Jess Kim"]).to include(leads: 3, qualified: 2, qualified_rate: 66.7)         # L1, L2, L9 → qualified L1, L2
  expect(rows["Priya Shah"]).to include(leads: 3, qualified: 1, overdue: 1)                  # L6, L7, L8; L7 text_back 2d
  expect(rows["Dana Ortiz"][:first_reply_minutes]).to eq(20) # median of 120, 10, 20, 25 → (20+25)/2 = 22.5 → rounds to 23
end
```
**Correction to make while implementing:** median of Dana's `[120, 10, 20, 25]` is `(20 + 25) / 2 = 22.5`; assert `first_reply_minutes` with `be_within(1).of(22.5)` and round to 1 decimal in the serializer. Add the needs-support test: stub `NEEDS_SUPPORT_THRESHOLD` to 1 → Dana `needs_support`; default → all `on_track`.
- [ ] **Step 2:** FAIL; **Step 3:** implement; **Step 4:** pass. Commit.

---

## Task 6: Controllers, routes, isolation and privacy

**Files:** Create controllers, `spec/requests/{leads,next_actions,coordinators}_spec.rb`, `spec/privacy/privacy_spec.rb`; Modify `config/routes.rb`, `spec/support/isolation.rb`.
**Interfaces — Produces:**
```
GET    /api/v1/leads?view=board|list&status=&coordinator=&q=&cursor=&per=   (board → Leads::Board, list → Leads::List; q with view omitted → list, max 8)
GET    /api/v1/leads/:id
GET    /api/v1/next_actions?coordinator=
POST   /api/v1/next_actions/:lead_id/:queue/completion   → 200 { done: true }
DELETE /api/v1/next_actions/:lead_id/:queue/completion   → 200 { done: false }
GET    /api/v1/coordinators                              (owner)
GET    /api/v1/coordinators/:name                        (owner; name URL-encoded)
```
`coordinator=` is honored for owners only (ignored for coordinators). Queue param outside `Leads::Queues::KEYS` → 422 `bad_queue`.

- [ ] **Step 1: Failing request specs** (key cases):
```ruby
it "gives the coordinator only their own leads" do
  sign_in(dana)
  get "/api/v1/leads", params: { view: "list", status: "all" }
  expect(response.parsed_body["leads"].map { _1["name"] }).to match_array(["L3 Alpha","L4 Alpha","L5 Alpha","L10 Alpha"])
end
it "404s another coordinator's lead for a coordinator" do
  sign_in(dana); get "/api/v1/leads/#{Lead.unscoped.find_by!(first_name: 'L1').id}"
  expect(response).to have_http_status(:not_found)
end
it "403s coordinators on /coordinators" do
  sign_in(dana); get "/api/v1/coordinators"; expect(response).to have_http_status(:forbidden)
end
it "toggles done through the API" do
  sign_in(owner)
  l7 = Lead.unscoped.find_by!(first_name: "L7")
  post "/api/v1/next_actions/#{l7.id}/text_back_now/completion", headers: h
  expect(response.parsed_body).to eq("done" => true)
  get "/api/v1/next_actions"
  expect(response.parsed_body["progress"]).to eq("done" => 1, "total" => 4)
  delete "/api/v1/next_actions/#{l7.id}/text_back_now/completion", headers: h
  expect(response.parsed_body).to eq("done" => false)
end
it "422s an unknown queue" do
  sign_in(owner); post "/api/v1/next_actions/#{SecureRandom.uuid}/nope/completion", headers: h
  expect(response).to have_http_status(:unprocessable_entity)
end
it "searches with literal wildcards" do
  sign_in(owner); get "/api/v1/leads", params: { q: "%" }
  expect(response.parsed_body["leads"]).to eq([])
end
```
Privacy spec: owner JSON of `/leads/:id` contains no `"answer"` key inside `screener.items` and the phone matches `\A•••-••••-\d{4}\z`; assigned coordinator JSON contains `answer`; `Rails.logger` captured during the request does not include any answer string (`StringIO` logger).
Isolation entries (agency B ids → 404): `GET /api/v1/leads/:id`, `POST|DELETE /api/v1/next_actions/:lead_id/:queue/completion`; list endpoints must return only agency A rows (`/leads`, `/next_actions`, `/coordinators`, `/coordinators/:name`).
- [ ] **Step 2:** FAIL; **Step 3:** implement controllers (`rescue_from` bad queue). **Step 4:** `make spec ARGS="spec/requests spec/privacy spec/isolation spec/services/leads"` → all pass; `docker compose exec api bundle exec rails boundaries:check` ok.
- [ ] **Step 5: Real data**: load Harbor, then as the Harbor owner `curl` `/api/v1/leads?view=board` and `/api/v1/coordinators` — Dana Ortiz `leads: 2252`, `share_pct: 63.8`; board returns ≤25 per column with accurate `count`s; each request < 500 ms.
- [ ] **Step 6:** `make verify` → exit 0. Commit; open PR.

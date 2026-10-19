# Linked inquiries Implementation Plan

> **For Cursor / OpenCode:** Implement task-by-task. Follow `docs/conventions/` and `docs/design/brand.md`. Stop if blocked — do not replan silently. **Commit after every task.**

**Goal:** Give every lead (one inquiry) a person: a `people` table, a lead panel that shows the person's other inquiries, import-review wording and an overlap warning, and `unique_people` next to the lead count, including for Ask Simbe and MCP.
**Spec:** `docs/superpowers/specs/2026-10/2026-10-19-0128-linked-inquiries-design.md` (approved, amended 2026-10-19)
**Depends on:** nothing unmerged · **Unblocks:** per-person metrics, a repeat-inquiry badge on cards (both non-goals here)
**Architecture:** `people` (identity only: one row per normalised email per agency, one per blank-email lead) and `leads.person_id` (NOT NULL, composite foreign key). The importer reads `leads.csv` once to assign `person_id`, writes `people` with COPY, then streams the leads, in one transaction. A pure rule (`Leads::Overlap`) and a service (`Leads::Inquiries`) feed the lead-detail API and the importer's warnings; `Metrics::Summary` adds one distinct count. No lead is merged and no existing number changes.
**Tech Stack:** Rails 8.1 packs (`leads`, `ingest`, `metrics`, `agent`), Postgres 16, OpenAPI contract + generated types, MSW mocks from the contract examples, React 19 + Tailwind, RSpec, Vitest, Playwright.

## Global Constraints

- A person is the lead's email, lower-cased and trimmed (`Snapshot::People.key_for`). A lead with a blank email is its own person (`email_key` null).
- `people`: `id` uuid, `agency_id` NOT NULL, `email_key` nullable string, timestamps. Indexes: unique `(agency_id, id)`; partial unique `(agency_id, email_key)` where `email_key IS NOT NULL`. `leads.person_id` uuid NOT NULL, index `(agency_id, person_id)`, composite foreign key `(agency_id, person_id)` → `people (agency_id, id)`, **immediate** (a deferred key made the Lakeside import 3-4x slower), no `ON DELETE` action. No stored per-person attributes.
- Replacing a snapshot deletes the agency's leads first, then its people; a reload never double counts or leaves orphans.
- Every query that groups or joins on `person_id` also filters by `agency_id` (default scopes; raw SQL binds `agency_id`).
- `other_inquiries` items have exactly: `id` (the lead's `external_id`), `created_at`, `stage`, `status`, `outcome_reason`, `channel`, `campaign`, `coordinator`. Oldest first, never the lead itself, always present (empty array).
- Owner sees all of the person's other inquiries; a coordinator only those assigned to them (`Leads::Access.relation`), and never learns that others exist.
- `open_overlap`: for two inquiries ordered by `(created_at, external_id)`, the earlier is **closed** when its outcome is `not_eligible`, `withdrew`, `unresponsive` or `accepted` and its `outcome_updated_at` is present and strictly earlier than the later one's `created_at`; otherwise the pair overlaps. A lead's `open_overlap` is true when it is in any overlapping pair, computed over all of the person's leads.
- Import review: keep warning code `duplicate_email` and its count; its message becomes "N extra leads share an email with another lead; they are linked as one person and kept as separate inquiries". New warning `open_duplicate_inquiry`, count = overlapping pairs, message "N pairs of inquiries from the same person were open at the same time"; never an error.
- `kpis.unique_people` is an integer: distinct `person_id` among the cohort's leads. The four headline KPIs and every existing golden value are unchanged.
- Words: a lead is an **inquiry**; the woman is a **person**. The UI keeps "Leads" in navigation and on the KPI tile.
- Never combine or compare screener answers across inquiries. No contact details, screener data or activity in `other_inquiries`. No agent tool takes or returns a person, email or lead id.
- Verification commands use Docker/`make`. UI is not done until seen at 1280px and 390px.

## Review Focus

- Loading the same export twice (and two agencies loading the same export) leaves the right number of `people` rows and never links across agencies (Tasks 2, 4).
- A blank, whitespace-only or mixed-case email: blank leads are each their own person, others link case-insensitively (Tasks 1, 2).
- Every existing spec that builds a lead directly (`Lead.create!`, `Lead.new`, `create(:lead)`) still passes because a lead without a `person` gets one automatically (Task 1).
- A person with 3 or more inquiries: every other inquiry is listed and every overlapping pair counted once (Tasks 3, 6).
- A coordinator whose related leads belong to someone else: `other_inquiries` is `[]`, yet `open_overlap` can be true and reveals only that boolean (Task 4).
- The agent or MCP client asked "how many people": it reads `unique_people`, not `leads` (Task 7).

## File Map

| Action | Path |
|---|---|
| Create | `db/migrate/20261019000001_create_people.rb`, `20261019000002_backfill_people.rb`, `20261019000003_enforce_leads_person.rb`; modify `db/schema.rb` (generated) |
| Create | `app/packs/leads/app/models/person.rb`; modify `app/packs/leads/app/models/lead.rb` |
| Create | `app/packs/ingest/app/services/snapshot/people.rb` |
| Modify | `app/packs/ingest/app/services/snapshot/importer.rb`, `snapshot/validator.rb`, `spec/support/rows_loader.rb` |
| Create | `app/packs/leads/app/services/leads/overlap.rb`, `leads/inquiries.rb` |
| Modify | `app/packs/leads/app/services/leads/detail.rb`, `app/packs/leads/app/serializers/lead_detail_serializer.rb` |
| Modify | `app/packs/metrics/app/services/metrics/summary.rb` |
| Modify | `app/packs/agent/app/services/agent/tools/get_funnel.rb`, `agent/system_prompt.rb` |
| Modify | `contracts/openapi/schemas/leads.yaml`, `snapshots.yaml`, `metrics.yaml`; examples `leads/detail-owner.json`, `detail-coordinator.json`, `snapshots/upload-ok.json`, `upload-committing.json`, `upload-committed.json`, `metrics/summary.json`, `summary-empty.json` |
| Modify | `app/javascript/api/generated/schema.d.ts` (generated), `app/javascript/api/types.ts` |
| Create | `app/javascript/features/lead-panel/InquiriesCard.tsx`, `InquiriesCard.test.tsx` |
| Modify | `features/lead-panel/LeadPanel.tsx`, `SummaryTab.tsx`, `app/javascript/features/week/WeekPage.tsx`, `WeekPage.test.tsx`, `app/javascript/components/shared/ReviewReport.test.tsx` |
| Modify | `bin/golden-numbers`, `spec/real_data/golden.json` (regenerated), `spec/real_data/ingest_golden_spec.rb`, `metrics_golden_spec.rb` |
| Create | `spec/models/person_spec.rb`, `spec/services/snapshot/people_spec.rb`, `spec/services/leads/inquiries_spec.rb` |
| Modify | `spec/requests/leads_spec.rb`, `metrics_spec.rb`, `mcp_spec.rb`, `snapshot_uploads_spec.rb`, `spec/services/snapshot/validator_spec.rb`, `spec/services/agent/tools_spec.rb`, `spec/privacy/agent_privacy_spec.rb`, `spec/models/tenant_fk_spec.rb` |
| Modify | `docs/about.md`, `docs/agent.md` |

---

## Task 1: `people` table, `Person`, `leads.person_id`

**Files:** the three migrations, `person.rb`, `lead.rb`, `snapshot/people.rb`, `spec/models/person_spec.rb`, `spec/services/snapshot/people_spec.rb`.
**Interfaces — Produces:** `Person` (`AgencyScoped`, `has_many :leads`, attribute `email_key`); `Lead belongs_to :person`; `Snapshot::People.key_for(email) -> String | nil` (lower-case, trim, blank → nil); a `Lead` created without `person_id` gets one in `before_validation` (declared after `AgencyScoped` so `agency_id` is set): `Person.find_or_create_by!(agency_id:, email_key:)` for a keyed email, a new `Person` for a blank one.

- [ ] **Step 1: Failing specs.** `people_spec.rb`: `key_for("  Mixed.Case@Example.COM ") == "mixed.case@example.com"`, `key_for("   ")` and `key_for(nil)` are `nil`. `person_spec.rb` (Alpha loaded): two leads created through `Lead.create!` with the same email in one agency share one `Person`; a blank-email lead gets its own `Person` with `email_key` nil; the same email in another agency gets a different `Person` (different `agency_id`); updating a lead's `person_id` to another agency's person raises `ActiveRecord::InvalidForeignKey`. Backfill: inside the example drop the `leads → people` foreign key and `NOT NULL` first (DDL rolls back with the example), set `person_id` to NULL and delete the people rows, then `load` the backfill migration and run `BackfillPeople.new.up`; expect one person per distinct email key and one per blank-email lead, every lead linked, and a second run changes nothing.
- [ ] **Step 2:** `make spec ARGS="spec/models/person_spec.rb spec/services/snapshot/people_spec.rb"` → FAIL.
- [ ] **Step 3: Migrations** (`Migration[8.1]`, schema and data kept apart). `…01_create_people`: `create_table :people, id: :uuid` with `agency_id` (null false), `email_key`, timestamps; `add_index :people, %i[agency_id id], unique: true`; partial unique `add_index :people, %i[agency_id email_key], unique: true, where: "email_key IS NOT NULL"`; `add_foreign_key :people, :agencies, on_delete: :cascade`; `add_column :leads, :person_id, :uuid` (nullable for now). `…02_backfill_people` (`up` only, plain SQL, idempotent): give every blank-email lead without a person a new `gen_random_uuid()` `person_id` and insert those people with null `email_key`; insert one person per distinct `(agency_id, NULLIF(lower(btrim(email)), ''))` not yet present; `UPDATE leads` to set `person_id` from the matching person where it is null; `down` is a no-op. `…03_enforce_leads_person`: `change_column_null :leads, :person_id, false`, `add_index :leads, %i[agency_id person_id]`, `add_foreign_key :leads, :people, column: %i[agency_id person_id], primary_key: %i[agency_id id]`. Run `docker compose exec web bundle exec rails db:migrate` and update the test schema.
- [ ] **Step 4:** the specs above, plus `make spec ARGS="spec/models spec/real_data/schema_golden_spec.rb"` (schema, tenant foreign keys and agency deletion still hold; extend `tenant_fk_spec.rb` with `leads → people` as another composite tenant foreign key) → PASS.
- [ ] **Commit:** `feat(leads): task 1 – people table and leads.person_id`

## Task 2: Importer and loaders assign people

**Files:** `snapshot/importer.rb`, `spec/support/rows_loader.rb`, `snapshot/people.rb`; specs in `spec/requests/snapshot_uploads_spec.rb` and `spec/real_data/ingest_golden_spec.rb`.
**Interfaces — Consumes:** `Snapshot::People.key_for`. **Produces:** `Snapshot::People::Registry` (`register(external_id, email) -> person id`, `person_id(external_id)`, `rows`) and `Snapshot::People.copy!(raw_connection, agency_id, registry, stamp)` which COPYs `people (id, agency_id, email_key, created_at, updated_at)`; the importer and `RowsLoader` both use them.

- [ ] **Step 1: Failing tests.** `snapshot_uploads_spec.rb` (or the existing import request spec): after a committed upload of the Alpha export, `Person.unscoped.where(agency_id:).count == Lead.unscoped.where(agency_id:).distinct.count(:person_id)`, every lead has a `person_id`, two leads sharing an email share it; re-committing the same export leaves the same people count and no people for other agencies; a lead with a blank email has its own person. `ingest_golden_spec.rb`: for each real agency the people count equals `golden["row_counts"]["leads"] - golden.dig("warnings", "duplicate_email_extra_rows")` (3,451 for Harbor) — skipped without the exports.
- [ ] **Step 2:** `make spec ARGS="spec/requests/snapshot_uploads_spec.rb spec/models/person_spec.rb"` → FAIL.
- [ ] **Step 3:** In `Importer`: add `person_id` to `COPY_COLUMNS[:leads]` and `people` to `ANALYZE_TABLES`; after `Lead.unscoped…delete_all` add `Person.unscoped.where(agency_id: agency.id).delete_all`; in `stream!` build one `Registry` from a first pass over `leads.csv` (same dedupe as the leads COPY), call `People.copy!` before the `leads` file, and let `row_values(:leads, …)` read `person_id` from it. `RowsLoader`: build the same map and `Person.unscoped.insert_all!` before inserting leads with `person_id`.
- [ ] **Step 4:** the commands above plus `make spec ARGS="spec/services/snapshot spec/real_data/ingest_golden_spec.rb"` and `docker compose exec web bundle exec rails boundaries:check` → PASS.
- [ ] **Commit:** `feat(ingest): task 2 – import assigns people`

## Task 3: Overlap rule and `Leads::Inquiries`

**Files:** `leads/overlap.rb`, `leads/inquiries.rb`, `spec/services/leads/inquiries_spec.rb`.
**Interfaces — Produces:**
- `Leads::Overlap::CLOSED_OUTCOMES = %w[not_eligible withdrew unresponsive accepted]`
- `Leads::Overlap.pairs(inquiries) -> Array<[earlier_id, later_id]>`; `inquiries` is an array of `{ id:, created_at:, outcome:, outcome_updated_at: }` (`Time`, `outcome_updated_at` may be nil). Sort by `[created_at, id]`; for every `i < j` emit `[sorted[i][:id], sorted[j][:id]]` unless sorted[i] is closed per the Global Constraints. Pure; the importer's validator uses it too.
- `Leads::Inquiries.call(user:, lead:) -> { other_inquiries: Array<Hash>, open_overlap: Boolean }`. Visible items: `Leads::Access.relation(user).where(person_id: lead.person_id).where.not(id: lead.id)` ordered by `lead_created_at, external_id`; item keys per Global Constraints with `stage` = `current_stage`, `status` = `Leads::Status.call(outcome:, queue: nil)`, `created_at` = `lead_created_at`, `coordinator` = `coordinator_name`. `open_overlap`: `Overlap.pairs` over `Lead.where(person_id: lead.person_id)` using `external_id` as the id; true when `lead.external_id` is in any pair.

- [ ] **Step 1: Failing spec.** `Overlap` (plain hashes): earlier `unresponsive` closed at 10:00, later created 11:00 → `[]`; earlier open → one pair; three open inquiries → `[[a,b],[a,c],[b,c]]`; equal `created_at` ordered by `id`; earlier `accepted` with `outcome_updated_at` equal to the later `created_at` → still a pair; earlier `unresponsive` with nil `outcome_updated_at` → a pair. `Inquiries` (Alpha, using `Lead.find_by!(first_name: "L1")` etc. and `update_columns(person_id:, …)` to put two leads on one person): owner gets the others oldest first without the lead itself; a lead alone on its person gets `[]`/`false`; a coordinator (`create(:user, role: "coordinator", agency:, coordinator_name: "Dana Ortiz")`) sees only Dana's leads, yet `open_overlap` stays true when the overlapping twin is Jess Kim's.
- [ ] **Step 2:** `make spec ARGS=spec/services/leads/inquiries_spec.rb` → FAIL.
- [ ] **Step 3:** Implement both as specified (one query for the person's leads, one for the visible ones).
- [ ] **Step 4:** same command → PASS; `rails boundaries:check` → ok.
- [ ] **Commit:** `feat(leads): task 3 – overlap rule and Leads::Inquiries`

## Task 4: Lead detail API and contract

**Files:** `leads/detail.rb`, `lead_detail_serializer.rb`, `leads.yaml`, `detail-owner.json`, `detail-coordinator.json`, `types.ts`, `spec/requests/leads_spec.rb`; regenerate `schema.d.ts`.
**Interfaces — Consumes:** `Leads::Inquiries.call`. **Produces:** `GET /api/v1/leads/:id` gains `other_inquiries` (array of schema `Inquiry`) and `open_overlap` (boolean), both required; TS alias `LeadInquiry = S["Inquiry"]` in `@/api/types`.

- [ ] **Step 1: Failing request examples** in `leads_spec.rb` (Alpha owner; put L2 on L1's person with `update_columns(person_id: l1.person_id)`): (1) owner `GET` L1 returns exactly one inquiry, L2, with the eight keys, and `open_overlap` true (L1 accepted 2026-09-26, after L2 created 09-21); (2) after setting L1's `outcome_updated_at` to `2026-09-20T12:00:00Z`, `open_overlap` is false; (3) a lead alone on its person returns `[]` and false; (4) agency B loaded with `AlphaScenario.load!` (same emails) gives agency A's owner `other_inquiries == []`; (5) a Dana Ortiz coordinator opening a Dana lead whose twin is Jess Kim's gets `[]` and `open_overlap` true; (6) no item contains `phone`, `email` or screener keys.
- [ ] **Step 2:** `make spec ARGS=spec/requests/leads_spec.rb` → FAIL.
- [ ] **Step 3:** `LeadDetailSerializer.call` gains `inquiries:` and merges both fields; `Leads::Detail.call` (its only caller) passes `Leads::Inquiries.call(user:, lead:)`. Contract: schema `Inquiry` (`id` uuid, `created_at` Timestamp, `stage` Stage, `status` Status, `outcome_reason`/`campaign`/`coordinator` nullable strings, `channel` string); both properties added to `LeadDetail.required`/`properties`; one inquiry in `detail-owner.json`, `[]`/`false` in `detail-coordinator.json`. `npm run types`; add `LeadInquiry` to `types.ts`.
- [ ] **Step 4:** `make spec ARGS="spec/requests/leads_spec.rb spec/isolation"`, `make contract`, `npm run types && git diff --exit-code app/javascript/api/generated` (after staging), `npx vitest run app/javascript/mocks` → PASS.
- [ ] **Commit:** `feat(leads): task 4 – other_inquiries and open_overlap on lead detail`

## Task 5: The lead panel says a lead belongs to a person

**Files:** create `InquiriesCard.tsx`, `InquiriesCard.test.tsx`; modify `LeadPanel.tsx` (header), `SummaryTab.tsx`.
**Interfaces — Consumes:** `LeadDetail["other_inquiries"]`, `["open_overlap"]`, `useLeadPanel().open(id, "summary")` from `@/app/leadPanel`, `formatDate(iso, tz, "short")` from `@/lib/format`. **Produces:** `InquiriesCard({ detail, tz })`, rendered in `SummaryTab` after the Simbe summary section (`SummaryTab` takes `tz`); a header line under the lead's name.

- [ ] **Step 1: Failing tests.** `InquiriesCard.test.tsx`: with two inquiries it shows the heading "This person's other inquiries" and two buttons containing the formatted date, status label, channel and coordinator, and clicking one calls `open` with its `id`; with `[]` and `open_overlap: false` it renders nothing; with `open_overlap: true` it shows "Another inquiry from this person was still open" even when the list is empty. In `LeadPanel.test.tsx`: the header shows "N other inquiries from this person" when `other_inquiries` has N ≥ 1 (singular "1 other inquiry from this person") and no such line when empty.
- [ ] **Step 2:** `npx vitest run app/javascript/features/lead-panel` → FAIL.
- [ ] **Step 3:** Implement with the Summary tab's card styling (`rounded-card border border-line p-4`, uppercase 11px heading), brand tokens only, rows as buttons with a visible focus ring; the header line is muted 12px text under the name; thread `tz` from `LeadPanelBody`.
- [ ] **Step 4:** `npx vitest run app/javascript/features/lead-panel`, `npm run typecheck && npm run lint` → PASS.
- [ ] **Step 5 (seen):** `npm run dev:mock`, open the panel for the example lead with an inquiry; screenshot the header and Summary tab at 1280px and 390px, compare with `handoff/design/screenshots/`, keep both for the PR.
- [ ] **Commit:** `feat(lead-panel): task 5 – person framing in the lead panel`

## Task 6: Import review wording and overlap warning

**Files:** `snapshot/validator.rb`, `snapshots.yaml`, the three snapshot examples, `ReviewReport.test.tsx`, `validator_spec.rb`, `snapshot_uploads_spec.rb`.
**Interfaces — Consumes:** `Leads::Overlap.pairs`. **Produces:** warning `{ code: "open_duplicate_inquiry", count: Integer, message: String }`; `ReportWarning.code` enum gains `open_duplicate_inquiry`.

- [ ] **Step 1: Failing tests.** `validator_spec.rb`: Alpha plus a lead sharing L1's email created while L1 is still open → `open_duplicate_inquiry` with count 1; when L1's `outcome_updated_at` precedes the new lead's creation the code is absent; the `duplicate_email` message equals "1 extra leads share an email with another lead; they are linked as one person and kept as separate inquiries" (count assertion kept). `snapshot_uploads_spec.rb`: the new message appears in the report for the fixture with a duplicate email. `ReviewReport.test.tsx`: the hard-coded string becomes the new message followed by ` (79)`.
- [ ] **Step 2:** `make spec ARGS="spec/services/snapshot/validator_spec.rb spec/requests/snapshot_uploads_spec.rb"` and `npx vitest run app/javascript/components/shared/ReviewReport.test.tsx` → FAIL.
- [ ] **Step 3:** Change the `duplicate_email` message; add `open_duplicate_inquiry_pairs(leads)`: group `rows[:leads]` by `Snapshot::People.key_for(email)` (skip nil), map each to `{ id: external_id, created_at:, outcome:, outcome_updated_at: }` (confirm the row keys in `snapshot/reader.rb`), sum `Leads::Overlap.pairs(group).size`, and emit the warning right after `duplicate_email` when positive. Add the enum value and description in `snapshots.yaml`; update the three examples and add the new warning to `upload-ok.json`.
- [ ] **Step 4:** the commands again plus `make contract` and `npx vitest run app/javascript/mocks` → PASS.
- [ ] **Commit:** `feat(ingest): task 6 – linked-inquiry wording and open_duplicate_inquiry`

## Task 7: `unique_people`, and the agent and MCP wording

**Files:** `metrics/summary.rb`, `metrics.yaml`, `summary.json`, `summary-empty.json`, `WeekPage.tsx`, `WeekPage.test.tsx`, `agent/tools/get_funnel.rb`, `agent/system_prompt.rb`, `spec/requests/metrics_spec.rb`, `spec/requests/mcp_spec.rb`, `spec/services/agent/tools_spec.rb`, `spec/privacy/agent_privacy_spec.rb`; regenerate `schema.d.ts`.
**Interfaces — Produces:** `kpis.unique_people` (integer, required) on `GET /api/v1/metrics/summary`; also in the `get_funnel` result (it passes `summary[:kpis]` through).

- [ ] **Step 1: Failing tests.** `metrics_spec.rb` (Alpha, 10 leads in the 30d cohort): put two leads on one person → `kpis.unique_people == 9`, a blank-email lead counts as its own person, and `leads.value`, `qualified.value`, `qualified_rate` and `cost_per_qualified` equal their existing assertions. `WeekPage.test.tsx`: the Leads tile shows "9 people" when `unique_people` (9) is below `leads.value` (10) and nothing extra when equal; its tooltip text is "A lead is one inquiry. The same person can inquire more than once." `mcp_spec.rb` and `tools_spec.rb`: the `get_funnel` result includes `kpis.unique_people`; `tools/list`'s `get_funnel` description contains "unique_people"; a prompt spec asserts `Agent::SystemPrompt.call(...)` contains "unique_people". `agent_privacy_spec.rb` still passes (no email in any outbound body).
- [ ] **Step 2:** `make spec ARGS="spec/requests/metrics_spec.rb spec/requests/mcp_spec.rb spec/services/agent"` and `npx vitest run app/javascript/features/week` → FAIL.
- [ ] **Step 3:** `TOTALS_SQL` adds `count(DISTINCT l.person_id) AS unique_people`; `kpis(...)` adds `unique_people:`; `empty` returns 0. Contract: property + required in `Summary.kpis`; both examples updated (`summary.json` below its leads value). `WeekPage`: secondary line "N people" on the Leads `KpiCard` only when lower than the lead count (reuse the card's secondary-text slot) with the tooltip. `get_funnel` `DEFINITION[:description]` gains "kpis.leads counts inquiries; kpis.unique_people counts distinct people (one person can inquire more than once)."; `SystemPrompt` gains the rule "- A lead is one inquiry; the same person can inquire more than once. When asked about people use unique_people, and say inquiries for lead counts." `npm run types`.
- [ ] **Step 4:** the commands, `make spec ARGS="spec/services/agent spec/requests/mcp_spec.rb spec/privacy"`, `make contract`, `npm run types && git diff --exit-code app/javascript/api/generated`, `npx vitest run app/javascript/mocks` → PASS.
- [ ] **Step 5 (seen):** screenshot This week at 1280px and 390px with the "N people" line.
- [ ] **Commit:** `feat(metrics): task 7 – unique_people, agent and MCP wording`

## Task 8: Golden numbers

**Files:** `bin/golden-numbers`, regenerate `spec/real_data/golden.json`, `ingest_golden_spec.rb`, `metrics_golden_spec.rb`.
**Interfaces — Produces:** per agency in the oracle: `warnings.open_duplicate_inquiry_pairs`, `row_counts.people`, and `summary[<range>].unique_people`, computed by the stdlib script with no app code.

- [ ] **Step 1: Failing specs.** `ingest_golden_spec.rb`: the `open_duplicate_inquiry` warning count equals `open_duplicate_inquiry_pairs` (Harbor 6) and `Person` count equals `golden["row_counts"]["people"]`. `metrics_golden_spec.rb`: `kpis.unique_people` equals `golden["summary"][range]["unique_people"]` for every range.
- [ ] **Step 2:** `make spec ARGS=spec/real_data` → FAIL (keys missing).
- [ ] **Step 3:** In `bin/golden-numbers` group leads by `email.strip().lower()` (a blank email is its own person); `people` = number of groups; overlapping pairs from each group sorted by `(created, lead_id)` using the closed rule in Global Constraints; `unique_people` per window = distinct person keys in the window. Run `bin/golden-numbers` to regenerate.
- [ ] **Step 4:** `git diff spec/real_data/golden.json` contains **only added lines**; `bin/golden-numbers --check` and `make spec ARGS=spec/real_data` → PASS (needs the local exports; skipped when absent). Harbor: 6 pairs, 3,451 people. Record Lakeside's values in the PR.
- [ ] **Commit:** `test(real-data): task 8 – golden values for people`

## Task 9: Docs and full verification

**Files:** `docs/about.md`, `docs/agent.md`.

- [ ] **Step 1:** `docs/about.md`: Glossary **Lead** becomes "One inquiry. The same person who inquires again is a new lead, linked to her earlier ones by email", add **Person**, and add to the lead-panel description "the person's other inquiries"; `docs/agent.md`: `get_funnel` also returns `unique_people` (distinct people), a lead is one inquiry, and the two wording changes of spec decision 12.
- [ ] **Step 2:** `make verify` → exit 0; paste the output and the Task 5 and 7 screenshots into the PR.
- [ ] **Commit:** `docs: task 9 – linked inquiries`; open the PR and run the spec's acceptance commands 1–11, attaching their output.

## Done when (acceptance commands)

The spec's acceptance criteria 1–12 pass, run exactly as written there, plus the 1280px and 390px screenshots.

# Leads workflow: pipeline, lead panel, next actions, coordinators — Design

**Status:** Approved for planning · **Depends on:** foundation, snapshot-ingest (metrics not required) · **Plans:** `plans/2026-10/2026-10-14-2009-leads-workflow-api.md` (backend), `plans/2026-10/2026-10-14-2010-leads-workflow-ui.md` (frontend)

## Goal
Give coordinators a daily list of next actions and a lead panel for their own leads, and give owners a pipeline board, lead list, and coordinator performance view — with health data visible only to the assigned coordinator.

## Findings
- Handoff §6–9 define the pipeline board (4 columns), the lead panel (Summary / Screener / Activity / Source tabs), the coordinators grid/detail and the coordinator's 4-queue "Next actions" screen.
- The data supports queues directly: `lead_facts.first_outbound_at` (text back), applications with `submitted_at IS NULL` + `last_contact_at` (nudge), appointments with `status = 'no_show'` (rebook), `leads.outcome = 'paused'` + `paused_until` (due back).
- Harbor has 4 coordinators (Dana Ortiz 2,252 leads = 64%, Jess Kim 446, Marcus Lee 418, Priya Shah 414); Lakeside 4 (Alex Rivera 16,895 …). `leads.coordinator_name` is a free-text name; `users.coordinator_name` links a login to it.
- The exports are an Oct 1 snapshot, so "today"/ages must use the snapshot's `as_of`.
- Screener answers are health data (see `docs/conventions/sensitive-data.md`); age (`How old are you?`) is the one demographic the cards show.

## Decisions
1. **Lead status** (derived at read time, as of `as_of`): `closed` (`not_eligible|withdrew|unresponsive`, tone danger/neutral), `paused`, `accepted`, else open → `action` if the lead is in a next-action queue (label by queue: *Text back now* danger, *Nudge* / *Rebook* warning), otherwise *On track* success.
2. **Next-action queues** (open leads except paused-due-back), first match wins in this order, each ordered by age desc:
   1. `text_back_now` — open, `first_outbound_at IS NULL`; age = `as_of − lead_created_at`.
   2. `nudge_applications` — open, `current_stage = 'application'`, latest application not submitted, and `last_contact_at` is null or `< as_of − 24h`; age = `as_of − coalesce(last_contact_at, application.started_at)`.
   3. `rebook_consults` — open and the lead's latest appointment (by `booked_at`) is `no_show`; age = `as_of − scheduled_for`.
   4. `paused_due_back` — `outcome = 'paused'` and `paused_until <= as_of::date`; age = `as_of − paused_until`.
   Reason strings are generated server-side (e.g. `Application 40% · quiet 8d · last section pregnancy history`).
3. **Pipeline columns** (a lead appears in exactly one, first match): `qualified` (qualified under the agency milestone and outcome ∈ open|accepted) → `action_needed` (in any queue, or open at inquiry/pre_screen) → `in_application` (open, stage application) → `consult` (open, stage consult). Closed and paused-not-due leads are off the board and visible in the list view via status filter (`status=all|open|closed|paused|accepted`, default open).
4. **Progress bar**: six segments (inquiry, pre_screen, application, consult, records, accepted) from `stage_events`; segments before the lead's furthest stage are green; the furthest segment is amber (in a queue), red (closed) or green; later segments grey. The API returns `segments: ["done"|"action"|"closed"|"current"|"todo", …]`.
5. **Role gating, enforced server-side**: owner sees all leads, filter by `coordinator`; coordinator is forced to `leads.coordinator_name = user.coordinator_name` (other leads → 404). Coordinators cannot call `/coordinators*`. Owners get verdicts only on the Screener tab; the **assigned coordinator** also gets raw answers. Phone is masked (`•••-••••-1768`) for everyone except the assigned coordinator; email is shown to owner and assigned coordinator. `age` comes from the `How old are you?` answer and is shown to both roles.
6. **Lead detail** (`GET /leads/:id`): `contact`, `consult` (latest appointment status/date), `screener: { counts: {met, review, not_met, unanswered, total}, items: [{question, verdict, answer?}] }` (the 10 most common questions in the agency's data define "total"), `process` (Screener, Application, Consult, Medical records, Accepted → `complete|ongoing|stopped|upcoming` + detail), `activity` (newest first: stages, contacts, application started/submitted, appointment booked/outcome, first web visit), `source` (channel, campaign, ad, first visit, pages viewed; "Self-reported" is not in the data and is returned as `null`), `summary { text, next_step }` (rule-based, no LLM in this feature). Prev/Next in the panel cycles through the ids of the list the UI already loaded (no server cursor).
7. **Done toggles**: `action_completions(agency_id, user_id, lead_external_id, queue, snapshot_as_of, completed_at)` (unique on the first five). `POST /next_actions/:lead_id/:queue/completion` creates, `DELETE` removes; both idempotent. Completions are keyed by `external_id` + `as_of`, so a new snapshot resets the day.
8. **Next actions API**: `GET /next_actions` (coordinator: own; owner may pass `coordinator=`) → `{ as_of, progress: {done, total}, queues: [{ key, title, hint, tone, count, items: [{ lead_id, name, age_minutes, age_label, reason, done }] }] }` — `count` = open (not done) items. Title/hint/tone: *Text back now* (danger) "New leads, no message sent yet"; *Nudge applications* (warning) "Quiet 24h+ mid-application"; *Rebook consults* (violet) "No-show with no new booking"; *Paused, due back* (neutral) "Return date has passed".
9. **Coordinators** (owner; stats cover **all leads in the snapshot**, the endpoint has no range): `GET /coordinators` → `[{ name, leads, share_pct, first_reply_minutes (median of lead_facts.first_response_minutes), qualified_rate, overdue, status }]` where `overdue` = their leads in queues 1–3 with age > 24h and `status` = `needs_support` if `overdue > 8` else `on_track`; `GET /coordinators/:name` adds 4 KPIs and `needs_action` leads. The UI footnote says differences can reflect lead mix as well as effort.
10. **Search** (`GET /leads?q=`): case-insensitive prefix/contains on first name, last name, email; max 8 for the ⌘K palette; scoped like the list.
11. **Pagination**: list view `per=50`, keyset by `(lead_created_at desc, id)`; board returns up to 25 per column plus `counts` for badges and a per-column `?column=&cursor=` loader.
12. **Isolation/privacy specs** cover: coordinator A cannot read coordinator B's lead (404), owner of agency B gets 404 for agency A ids, owner never receives `answer`, phone masking rules, and no raw answers in logs.

## Non-goals
Sending SMS/calls (buttons open `sms:`/`tel:` for the assigned coordinator only), booking integration (`Book consult` is rendered disabled with a tooltip), reassigning leads, notes/comments, editing lead data, LLM summaries (agent plan may upgrade `summary`).

## Acceptance criteria
1. `make spec ARGS=spec/services/leads` passes on Alpha (v1): 4 queue items (L7 text_back_now, L4 nudge, L3 rebook, L10 paused_due_back), board counts `action_needed 4, in_application 0, consult 0, qualified 3`; on v2 L12 sits in `in_application`.
2. `make spec ARGS=spec/requests/leads_spec.rb spec/requests/next_actions_spec.rb spec/requests/coordinators_spec.rb` passes, including coordinator scoping, 404 across agencies and coordinators 403 on `/coordinators`.
3. `make spec ARGS=spec/privacy` passes: owner JSON never contains a screener `answer` (except age); non-assigned coordinator gets 404; phone masked for owner.
4. `make web-test ARGS=app/javascript/features/leads` passes (board columns, mobile column chips, lead panel tabs, Done toggle updates counts and progress, coordinator nav gating).
5. `make e2e ARGS=leads` passes: coordinator signs in → Next actions → opens a lead → marks done → counts update; owner opens Pipeline → lead panel → Screener tab shows verdict pills but no raw answers. Screenshots `{pipeline,lead-panel,next-actions,coordinators}-{desktop,mobile}.png` saved.
6. `docker compose exec web bundle exec rails boundaries:check` exits 0.

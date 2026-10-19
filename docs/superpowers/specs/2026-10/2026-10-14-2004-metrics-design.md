# Metrics API: KPIs, funnel, channels, recommendations — Design

**Status:** Approved for planning · **Depends on:** snapshot-ingest · **Plan:** `plans/2026-10/2026-10-14-2005-metrics.md`

## Goal
Server-side, agency-scoped numbers that answer the owner's one question — *which channels, process steps and people turn leads into qualified surrogates* — with honest handling of tiny samples. *Amended 2026-10-19: ad spend was dropped. The exports carry no spend, so Simbe shows no spend, cost per qualified or forecast and never invents placeholder numbers; see the PR that removed it.*

## Findings
- "Qualified" differs per agency (Harbor: attended a consult; Lakeside: reached records) and is already derivable from `lead_facts` (`consult_attended_at`, `records_at`, `application_submitted_at`, `accepted_at`) + `agencies.qualified_milestone`.
- The exports contain **no ad spend**, so Simbe does not show spend or cost per qualified at all; channels are compared on leads and qualified rate.
- 30% of Harbor leads (1,045 of 3,530) have no source; 14.9% are outside the eight main states (CA ID WA UT CO AZ OR NV = 3,004 leads = 85.1%) — both are headline insight cards in the design.
- `stage_history` is authoritative for funnel counts; funnel rows in the design are Inquiry, Application, Consult booked, Attended consult, Records, Accepted.
- Lakeside has ~30k leads / 300k screener rows: every endpoint must be SQL aggregates, not Ruby loops.

## Decisions
1. **Cohort semantics**: a range (`30d | 90d | 12m`) selects leads **created** in `[as_of − range, as_of]` (inclusive end); "qualified" counts those leads that ever reached the milestone in the snapshot. The previous period is the equal-length window before it; deltas are `value − previous` (percentage points for rates), `null` when the previous window has no leads. `as_of` is the snapshot's `as_of`, not wall-clock. Day/week boundaries use the agency time zone.
2. **KPIs**: `leads`, `qualified`, `qualified_rate = qualified/leads`. Any rate with fewer than 30 leads carries `low_sample: true`.
3. **Funnel** (`/metrics/funnel`): six rows with `count`, `pct_of_previous`, `pct_of_total`, and `exit_reasons` (top two `outcome_reason` — falling back to `outcome` — among *closed* leads — `not_eligible|withdrew|unresponsive` — whose furthest funnel row is that row). Plus **form drop-off**: unsubmitted applications grouped by `last_section_completed`, as % of unsubmitted. The row for the agency's qualified milestone is flagged `qualified: true` (drives brand coloring in the UI).
4. **Channels** (`/metrics/channels`): per normalized channel — `leads`, `qualified`, `rate`, with `best`/`worst` flags on rate (only among channels with enough leads). **Insights**: `unattributed` (share with channel Unknown) and `out_of_area` (leads whose state holds <1% of the agency's leads, labelled "outside your main states" with the list of main states).
5. **Channel detail** (`/metrics/channels/:channel`): the same KPIs for one channel plus a campaigns table (`campaign`, `ad` count, `leads`, `qualified`, `rate`); unknown channel names → 404.
6. **(removed)** Ad spend: the former `ad_spend_daily` table, sample generator and `spend_source` were dropped; the exports carry no spend.
7. **Recommendations** (`/recommendations`, owner): deterministic rules produce up to 4 cards `{id, area: process|ads|people, impact, title, why, cta:{label,route}, ask:{question}}` ranked by leads affected: biggest funnel leak (largest absolute lead loss between consecutive rows), best vs worst channel (qualified rate), unattributed share ≥15%, consult no-show rate ≥10% (rebook), coordinator load imbalance (one coordinator >50% of leads) or slow first reply (median first reply >4h). No LLM involvement; "Ask why" only hands the `ask.question` to the agent.
8. **Changing the definition** (`PATCH /agency {qualified_milestone}`, owner) takes effect on the next request; cache keys include `snapshot.id` and `qualified_milestone`.
9. **Access**: all `/metrics/*` and `/recommendations` are **owner only** (they expose channel performance). Coordinators get 403.
10. **Performance**: each endpoint < 500 ms on the real Lakeside snapshot on a laptop; results cached in `Rails.cache` (memory store in dev) per `(agency, snapshot, milestone, range, endpoint)`.
11. All SQL is in `Metrics::*` classes taking `agency:`; the agency id is always a bind parameter and the qualified column comes from a fixed whitelist.

## Non-goals
Attribution modeling beyond `leads.channel`/`campaign`, real Google/Meta API sync, statistical significance tests, forecasting and anything that needs ad spend.

## Acceptance criteria
1. `make spec ARGS=spec/services/metrics` passes using the Alpha scenario: leads 10, qualified 3 (consult_attended) / 2 (records) / 4 (application_submitted) / 1 (accepted); channel table Facebook 3/2, Instagram 1/0, Google 3/0, Referral 1/1, TikTok 1/0, Unknown 1/0; funnel 10/5/4/3/2/1.
2. `make spec ARGS=spec/requests/metrics_spec.rb` passes (owner 200, coordinator 403, signed-out 401, bad range 422).
3. `make spec ARGS=spec/isolation` passes with the new routes registered.
4. With real data loaded: `curl -s -b cookies localhost:3000/api/v1/metrics/channels | jq '.insights.unattributed.pct, .insights.out_of_area.pct'` prints `29.6` and `14.9` for Harbor (1,045/3,530 and 526/3,530).
5. `docker compose exec web bundle exec rspec spec/performance --tag perf` passes (Lakeside endpoints < 500 ms, skipped unless real data is loaded).
6. `docker compose exec web bundle exec rails boundaries:check` exits 0.

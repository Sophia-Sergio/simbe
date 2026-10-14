# Prep for the call with Erin

## What the call is for

The brief weights discovery and product judgment at 25%, same ballpark as engineering. Erin owns a small agency and is drowning in CSV exports — she has pain, not a spec. The job on this call is to narrow a large possible feature set down to the 2-3 things that actually matter, since the build window is only a few hours.

## Questions worth bringing

- **Decisions, not dashboards**: "What decision are you trying to make right now that you can't make today?" (cut a bad channel, reassign a coordinator, chase paused leads)
- **Her definition of success**: the brief says Harbor's qualified = consult attended (Lakeside's is records stage) — confirm *why*, and whether she also cares about accepted/records as a secondary number.
- **Cadence**: daily check, weekly review, or only pull it up when something feels off?
- **Who else touches it**: coordinators? Just her? If coordinators see it, performance metrics become sensitive.
- **What's broken today**: manually eyeballing spreadsheets per channel? missing follow-ups? surprised by drop-off she can't explain?
- **Reload behavior**: she'll give a fresh export at the follow-up — has she been burned by double-counted numbers in her current tools?

## Features she may ask for

**Near-certain** — map directly to what the exports support:
- Funnel view: leads by stage, conversion % stage-to-stage, where people stall
- Source/campaign/ad performance — which channels produce qualified leads, not just volume
- A simple lead list/detail view she can click into (timeline of `contact_log` + `stage_history` + `screener_answers` for one person)

**Likely, worth probing for**:
- Coordinator response time ("how fast do we text back after an inquiry?") — `contact_log.contacted_at` vs lead `created_at`
- Why leads get disqualified — `screener_answers.meets_requirement = no/review` broken down by question
- No-show rate on booked consults — `appointments.status`
- Application abandonment — `percent_complete` / `last_section_completed` drop-off points
- Paused leads worth re-engaging — `paused_until` nearing/past due

**Possible but lower priority**:
- Per-coordinator leaderboard — useful but politically sensitive; don't build unless she asks
- Cost-per-lead / ROI by channel — no ad-spend data in the exports, so this isn't answerable; flag as a limitation rather than guess
- Cross-agency benchmarking — explicitly against the brief's isolation rule; call out as a non-goal if it comes up

## Things to keep in mind while building

- **Multi-tenancy**: isolate Harbor/Lakeside, and keep each agency's "qualified" definition as config, not a hardcoded rule.
- **Timezones**: Harbor is Pacific, Lakeside is Central, exports are UTC — convert at display time.
- **Idempotent reloads**: the follow-up gives a new full snapshot; load keyed on `lead_id` so a re-import doesn't double count.
- **Don't over-promise**: some things the data can't answer (spend/ROI, coordinator intent, why a lead went cold). Better to say "the data doesn't show that" on the call than discover it mid-build.

See [`data-model.md`](./data-model.md) for how the seven CSVs connect.

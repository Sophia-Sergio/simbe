# Snapshot ingest: load full CSV exports safely — Design

**Status:** Approved for planning · **Depends on:** foundation · **Plan:** `plans/2026-10/2026-10-14-2003-snapshot-ingest.md`

## Goal
Load an agency's seven CSV exports (a *full snapshot*, not a delta) into Postgres, tagged with the agency, validated before commit, replacing the previous snapshot atomically and never double counting.

## Findings (from `harbor-takehome/` and a profile of both exports)
- Seven files per agency, all keyed by `lead_id`; **no agency id** in any file (`docs/data-model.md`). Timestamps are UTC ISO-8601 with ms.
- Real sizes — Harbor: leads 3,530 · stage_history 9,257 · contact_log 10,446 · screener_answers 35,300 · web_sessions 9,901 · appointments 642 · applications 918. Lakeside: 29,740 · 87,378 · 113,000 · 297,400 · 78,051 · 8,076 · 11,357.
- No duplicate natural keys and no orphan rows today, but a newer export will be loaded: the loader must enforce both.
- `source` is messy: `facebook`, `fb`, `Facebook`, `instagram`, `ig`, `google`, `Google`, `tiktok`, `referral`, blank (Harbor: 1,045 blank = 30%).
- Duplicate people exist by email (Harbor 79, Lakeside 702) with distinct `lead_id`s.
- `leads.current_stage` is a snapshot; `stage_history` is the authoritative trail (docs). Qualified is not a column; it is a milestone per agency (`consult_attended` Harbor, `records` Lakeside).
- The reference loader `harbor-takehome/db/load.sql` already proves the schema/replace-in-one-transaction approach and the `lead_milestones` / `lead_qualification` derivations.

## Decisions
1. **Schema** (all tenant tables carry `agency_id`, composite-safe): `leads` (UUID `id`, `external_id` = export `lead_id`, unique per agency; plus normalized `channel`), `stage_events`, `contacts`, `screener_answers` (`answer` **encrypted**), `web_sessions`, `appointments`, `applications`, `lead_facts`, `snapshots`, `snapshot_uploads`.
2. **Natural keys** (unique per agency): stage_events `(lead, stage)`; contacts `(lead, contacted_at, direction, channel)`; screener_answers `(lead, question)`; web_sessions `(lead, started_at)`; appointments `(lead, booked_at)`; applications `(lead, started_at)`.
3. **Channel normalization** at ingest into `leads.channel` (raw kept in `source_raw`): facebook|fb→`Facebook`, instagram|ig→`Instagram`, google→`Google`, tiktok→`TikTok`, referral→`Referral`, blank→`Unknown`, any other value → titleized and counted as a warning `unknown_source`.
4. **`lead_facts`** (one row per lead, computed in SQL inside the import transaction): `application_submitted_at` (max submitted), `consult_attended_at` (min `scheduled_for` where status `attended`), `records_at`, `accepted_at` (from stage_events), `furthest_stage`, `first_outbound_at`, `first_response_minutes`, `last_contact_at`, `last_inbound_at`, screener counts `screener_met/review/not_met/total`. Qualification is **not stored**: it is derived from `agencies.qualified_milestone`, so changing the definition recomputes everything with no reload.
5. **Snapshot "as of"**: `snapshots.as_of` = max timestamp present in the files (capped at upload time). All "age"/"today" logic uses `as_of`, not wall-clock, so an Oct 1 export reads correctly. UI shows "Snapshot Oct 1".
6. **Two-step upload**: `POST /snapshot_uploads` stores files in `storage/snapshot_uploads/<id>/` and returns a validation **report**; `POST /snapshot_uploads/:id/commit` replaces the agency's data. Uploads expire after 24h.
7. **Validation report** (blocking `errors`, non-blocking `warnings`, and `diff`): all 7 files present (matched by basename, case-insensitive) · required headers exact · every row parses (timestamps, enums `stage`/`outcome`/`meets_requirement`/`status`) · no duplicate natural keys · no orphan `lead_id` · **agency match**: no `lead_id` may already belong to a different agency, and if the agency already has a snapshot, ≥50% of its current `external_id`s must appear in the new `leads.csv`. Warnings: `stage_mismatch` (current_stage ≠ furthest in stage_history), `unknown_source`, `duplicate_email`, `source_aliases_normalized`. Diff: per-table new vs current counts and leads delta (+81 style).
8. **Replace in one transaction**: advisory lock per agency → delete agency leads (children cascade) → bulk insert (5,000-row batches; screener answers encrypted per row) → compute `lead_facts` → insert `snapshots` row → commit. Any error rolls back to the previous snapshot. A concurrent commit returns `409 already_in_progress`.
9. **Other tables that reference leads** (e.g. completed next-actions) must reference `leads.external_id`, never `leads.id`, because lead rows are re-created on every snapshot.
10. **Owner only.** Coordinators get 403. A CLI `rake snapshot:load[slug,dir]` uses the same service for local data loading.
11. **Fixtures**: an `ExportBuilder` DSL writes tiny synthetic exports; the **Alpha scenario** (10 leads, known answers; defined in the plan) is the reference dataset reused by later plans.

## Non-goals
Incremental/delta loads, automatic cross-snapshot history/diffing of individual lead changes, merging duplicate people, streaming uploads over ~200 MB, ad-platform sync.

## Acceptance criteria
1. `make spec ARGS=spec/requests/snapshot_uploads_spec.rb` passes (upload→report→commit, errors block commit, coordinator 403, second concurrent commit 409, other agency's upload id 404).
2. `make spec ARGS=spec/services/snapshot` passes: Alpha counts; loading Alpha twice leaves identical row counts; a corrupt file rolls back and keeps the previous snapshot; cross-agency `lead_id` blocked.
3. `make spec ARGS=spec/services/channels/normalizer_spec.rb` passes for all aliases above.
4. With the real exports present locally, `docker compose exec api bundle exec rails "snapshot:load[harbor,../harbor-takehome/exports/harbor]"` then the same command again, then `docker compose exec db psql -U simbe simbe_development -c "select count(*) from leads l join agencies a on a.id=l.agency_id where a.slug='harbor'"` prints `3530` both times.
5. `docker compose exec db psql -U simbe simbe_development -c "select count(*) from screener_answers where answer ~ '^[0-9]+$'"` prints `0` (answers are stored encrypted).
6. `docker compose exec api bundle exec rails boundaries:check` exits 0 (`unscoped` appears only under `app/services/snapshot/`).

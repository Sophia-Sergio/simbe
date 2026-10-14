# Parallel build architecture: lanes, contracts and extension points — Design

**Status:** Approved for planning · **Depends on:** the 8 feature specs/plans (`2000`–`2014`), which stay as the **detail reference** · **Plans:** `plans/2026-10/2026-10-14-21xx-*` (Wave 0–3, indexed in `../../parallel/README.md`)

## Goal
Re-slice the app (desktop + mobile web) into **independent lanes** that many agents (Cursor, OpenCode, Claude Code) can implement **at the same time** without waiting on each other and without merge conflicts, then integrate against the real backend.

## Findings (why the original plans can't run in parallel)
1. **Shared append-only files** — every plan edits `backend/config/routes.rb`, `backend/spec/support/isolation.rb`, `frontend/src/routes/router.tsx` and the shell nav.
2. **Shared API hook files** — e.g. `src/api/leads.ts` is created by one UI plan and consumed by five screens.
3. **Specs load test data through the CSV importer** (`Snapshot::Importer`), so metrics/leads/agent can't start before ingest is finished.
4. **UI plans need pieces owned by other plans** (`LeadPanel` opened from pipeline, coordinators, next actions and search; `useAgent` from insights).
5. **Frontend plans need a running backend** to see anything.
6. Backend plans each add migrations; parallel migrations collide on `schema.rb`.

## Decisions
1. **Waves.** Wave 0 builds the shared substrate (small, mostly parallel inside). Wave 1 = 18 fully independent lanes (5 backend, 13 frontend). Wave 2 = 2 backend lanes (agent, MCP) that need Wave 1 backend merged for real behavior but are written against fixed interfaces. Wave 3 = integration. Lane catalog and ordering: [`../../parallel/README.md`](../../parallel/README.md).
2. **Contract first.** `contracts/openapi/` (OpenAPI 3.1, one file per domain) is the single source of truth for every HTTP payload. It is **authored and merged before any lane starts** (see `2101`). Frontend gets generated types + typed hooks; backend gets response-conformance checks in request specs. A lane never changes the contract; it files a **Contract Change Request** (small PR touching only `contracts/` and labelled `ccr`, merged within the day and rebased by all lanes).
3. **Mock API for the frontend.** MSW handlers + JSON fixtures derived from the Alpha scenario (`contracts/examples/`) serve every endpoint in the browser (dev, Playwright) and in Vitest. A conformance test validates every fixture against the OpenAPI schema, so mocks cannot drift from the contract. Frontend lanes **never need the Rails server**; `VITE_API_MODE=mock|real` switches (Wave 3 flips the default).
4. **Fixture-backed backend data.** `AlphaScenario.load!(agency, version = :v1)` (Wave 0 backend core) inserts the Alpha dataset directly into the final tables and computes `lead_facts`, so metrics/leads/agent specs never touch the importer. The importer lane tests the CSV path separately. `Leads::Queues` (the shared queue read-model) and `Channels::Normalizer` also live in Wave 0.
5. **All schema in Wave 0.** One agent writes every table the app needs (ingest, spend, completions, invitations, ad connections, agent, MCP keys) in a single migration set. Lanes add **no** migrations. If a lane truly needs one it gets a reserved version block (`20261015<lane-index>…`) and resolves `schema.rb` conflicts by re-running `db:migrate` + `db:schema:dump`, never hand-merging.
6. **Zero shared-file edits via auto-registration.**
   - Backend: `config/routes.rb` loads `config/routes/*.rb` (one file per lane, `draw`-style); isolation entries live in `spec/support/isolation/<lane>.rb` and are auto-required; serializers/services are namespaced per lane.
   - Frontend: every lane exports `src/features/<lane>/feature.ts` (`FeatureModule = { routes?, nav?, overlays?, providers?, topBar? }`); the app collects `src/features/*/feature.ts` with `import.meta.glob`. Overlays (lead panel, agent panel, search palette) mount through shell **slots**. `useLeadPanel` and `useAgent` are tiny contracts in `src/app/` (Wave 0) with no-op defaults that the owning lane replaces by registering a provider.
7. **Generated API layer.** `src/api/generated/schema.d.ts` (openapi-typescript) + `src/api/hooks/<domain>.ts` (typed TanStack Query hooks, written once in Wave 0 by domain, with the exact hook names already used in the lane plans) + `src/api/client.ts` (`jsonRequest`, `ApiError`). Lanes consume hooks; they don't create `src/api/*` files.
8. **UI kit in Wave 0.** Generic components (Button, Pill, Toast, Modal, Sheet, Segmented, Input, Avatar, Skeleton, EmptyState, Tabs, KpiCard, Donut, Ring, BarRow, ProgressBar, StatusPill, ChannelTile, Table) are built once, tokenized per `docs/design/brand.md`, shown on a `/__kit` gallery page, and are **read-only** for feature lanes. Feature-specific components stay inside the owning lane.
9. **Desktop and mobile are first-class lanes.** Shell is split into **Desktop shell** (≥860px: sidebar, top bar, FAB slot) and **Mobile shell** (<860px: top bar, bottom tab bar, More sheet, full-screen overlays, bottom-sheet modals) behind a `useIsDesktop()` switch. Every feature lane must pass **both viewports** in its own Playwright spec (1280×800 and 390×844) with screenshots; Wave 3 adds a mobile/brand audit lane.
10. **Ownership matrix.** Each lane has an `Owns` list of globs; CI job `ownership-check` fails a PR that touches files outside its lane (allowed extras: `contracts/**` only with the `ccr` label, `docs/**` for its own plan checkboxes). Lanes branch from `main` after Wave 0 and merge in any order.
11. **Merge protocol.** Squash-free, rebase-on-main before PR; one PR per lane; CI = `make verify` + `ownership-check` + contract conformance; a lane is "done" only when its acceptance commands pass and screenshots are attached. Merge order within a wave doesn't matter; if two lanes need the same file, that's a bug in the lane definition — stop and file a CCR/ownership issue instead of editing it.
12. **Definition of done (every lane):** tests green (`make verify`), both viewports screenshotted and compared against `design_handoff_simbe/screenshots/` (layout) and `docs/design/brand.md` (look), acceptance commands from its plan pasted in the PR, no `TODO`s, a11y basics (labels, focus ring, Esc closes overlays).

## Non-goals
Splitting work finer than a screen/domain; microfrontends or separate deployables; changing any product decision in the eight feature specs; contract versioning beyond `/api/v1`.

## Acceptance criteria
1. `test -f contracts/openapi/openapi.yaml && npx --yes @redocly/cli@1 lint contracts/openapi/openapi.yaml` exits 0 and `grep -c "operationId:" contracts/openapi/paths/*.yaml | awk -F: '{s+=$2} END {exit !(s>=38)}'` exits 0 (≥38 operations).
2. Every lane plan lists `Owns`: `for f in docs/superpowers/plans/2026-10/*-lane-*.md; do grep -q '^\*\*Owns' "$f" || echo "missing Owns: $f"; done` prints nothing.
3. No two lane plans claim the same owned path: `bash docs/superpowers/parallel/check-ownership.sh` exits 0 (the script ships with this spec set and is also run in CI by the `ownership-check` job added in Wave 0 repo scaffold).
4. Wave-1 plans never edit shared files: `grep -lE "config/routes\.rb|router\.tsx|ISOLATION_ROUTES|src/api/(leads|metrics)\.ts" docs/superpowers/plans/2026-10/*-lane-*.md` prints nothing.
5. `docs/superpowers/parallel/README.md` contains the lane matrix with, for every lane: ID, wave, depends-on, owner globs, plan link; `grep -c '^| [BFWI]' docs/superpowers/parallel/README.md` ≥ 30.

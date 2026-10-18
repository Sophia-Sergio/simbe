# W3-1 integration log

Running record for lane **W3-1** (plan [`2026-10-14-2160-w3-1-integration-real-api.md`](../plans/2026-10/2026-10-14-2160-w3-1-integration-real-api.md)):
what was run, what it returned, and every documented difference or deviation. Command output is
pasted verbatim (trimmed) so a reviewer can re-run each step.

Environment: worktree `.worktrees/w3-1` (own stack `simbe-wt-w3-1`), host ports from `make ports`
(`web 56069`, `vite 56070`, `db 55761`). Real exports mounted read-only from the main checkout via
`SIMBE_EXPORTS_DIR`.

## Task 1 — Real-mode default and e2e seeding

- `.env.example` documents `VITE_API_MODE=real` (default) / `mock` (Rails-embedded dev against MSW);
  `vite.mock.config.ts` already forces `mock` for the standalone host, so no change was needed there.
  Playwright's `real-*` projects stay selected by `E2E_API=real` + `E2E_BASE_URL` (playwright.config.ts).
- Created `lib/tasks/e2e.rake` (`e2e:seed`, `e2e:alpha_files`).
- `docker compose exec web bundle exec rails e2e:seed` **twice** → both print nothing and leave the
  same counts (idempotent):

  ```
  leads=10 stage_events=32 screener=100 users=5 spend=3 snapshots=2
  leads=10 stage_events=32 screener=100 users=5 spend=3
  ```

- HTTP check (host `curl` through Puma, cookie jar):

  ```
  POST /api/v1/session {erin@harbor.test}      -> 201, role=owner, agency.slug=harbor
  GET  /api/v1/metrics/summary?range=30d       -> 200
       kpis.leads.value = 10, qualified = 3, spend_source = "import"
  ```

### Task 1 deviations (both required to make the task run)
1. `e2e:seed` also `require`s `spec/support/rows_loader.rb`: `AlphaScenario.load!` calls `RowsLoader`,
   and `spec/support` is never autoloaded outside RSpec, so the plan's two requires alone raise
   `NameError` at runtime.
2. `e2e:alpha_files` default dir is `Rails.root.join("e2e/fixtures/alpha")`; the plan wrote
   `Rails.root.join("../e2e/fixtures/alpha")`, which resolves outside the repo (plan `2012` and CI
   both use `e2e/fixtures/alpha`).
3. Environment (not a repo change): this worktree's git-ignored `.env` had no
   `AR_ENCRYPTION_PRIMARY_KEY` / `AR_ENCRYPTION_KEY_DERIVATION_SALT`, so `e2e:seed` could not write
   screener answers (`ActiveRecord::Encryption::Errors::Configuration`). Generated a fresh pair with
   `bin/rails db:encryption:init`-equivalent values and added them to `.env`.

### Outside-lane items found in Task 1 (not changed by this lane)
- Task 1 Step 1 asks to document "Mock vs real" in `README.md`, which is owned by **W0-1**, not W3-1.
  `bin/lane check` would fail on it, so it is left for an ownership change / W0-1 (the `.env.example`
  comment carries the same information inside the lane).

## Task 2 — Contract coverage and fixture parity

- `make contract-coverage` → **`39/39 operations exercised`** (no unexercised operation, so Step 1
  needs no new spec). Baseline before any change was already 39/39.
- Added `spec/contract/fixture_parity_spec.rb`: 22 examples calling every contract operation that has
  an example under `contracts/examples/**` against the real Alpha-backed API, comparing to the
  fixture the MSW mocks serve.

  ```
  make spec ARGS=spec/contract/fixture_parity_spec.rb
  22 examples, 0 failures
  ```

### Documented differences (asserted as shape equality, not value equality)
- `GET /snapshots/current` — `snapshots/current.json` is Harbor-shaped (3,530 leads); Alpha has 10,
  and Alpha carries no `warnings`. Same keys/types, values differ by design.
- `GET /mcp` — the key prefix/created_at are generated per agency.
- `POST /invitations` — `accept_url` embeds a one-time token.
- `POST /agent/messages` — the answer body only matches when the model answer is stubbed; the
  provider is stubbed (WebMock) with a full `respond` payload so the *shape* is comparable.
- `POST /snapshot_uploads` — the report is produced by the async validator.
- `GET /leads/{id}` — Alpha carries no `web_sessions` and answers every screener question `yes`, so
  the two web-derived fields and the coordinator's answer text differ from the hand-authored example
  (the same canonicalization the leads owner spec documents).
- `contracts/examples/snapshots/upload-{ok,errors,committing,committed}.json` and
  `current-loading.json` are scenario variants of operations already covered; they are exercised by
  `spec/requests/snapshot_uploads_spec.rb`, not duplicated here.

## Task 3 — Role and tenancy matrix

- Added `spec/security/role_matrix_spec.rb`: the table is generated from the bundled OpenAPI (39
  operations), and "owner-only" is derived from each operation's documented `403`. Each operation is
  called as `:signed_out`, `:owner`, `:coordinator` and with another agency's ids (`:foreign`), on the
  real app: signed-out → 401 (public operations must answer a documented status), owner → a documented
  success (never 401/403/404), coordinator → 403 on owner-only operations, foreign ids → 404
  (exhaustive per-route sweep: `spec/isolation/isolation_spec.rb`).

  ```
  docker compose exec -e RAILS_ENV=test web bundle exec rspec spec/contract spec/security
  27 examples, 0 failures
  ```

### Contract gaps found by the matrix (owner-only in the app, 403 missing from the contract → CCRs)
These are **not** app authorization bugs: the matrix proves coordinators are refused (403) on each. The
contract omits the 403, so a `ccr` PR should add it. The spec encodes them in `CONTRACT_GAPS` and
asserts the secure (403) behaviour.

| Operation | App gate | Contract declares |
|---|---|---|
| `getAgency` (`GET /agency`) | `agencies_controller` `require_owner!` | 200, 401 |
| `deleteInvitation` (`DELETE /invitations/{id}`) | `invitations_controller` `require_owner!` | 204, 404 |
| `cancelSnapshotUpload` (`DELETE /snapshot_uploads/{id}`) | `snapshot_uploads_controller` `require_owner!` | 204, 404 |
| `commitSnapshotUpload` (`POST /snapshot_uploads/{id}/commit`) | `snapshot_uploads_controller` `require_owner!` | 202, 404, 409, 422 |

Two contract readings needed an explicit exception, documented in the spec:
- `createSession` documents a 403, but it is not an owner gate (any role signs in) → treated as public.
- several operations document no 401/404/403 for statuses the app legitimately returns; the spec opts
  out of response conformance with `ignore_unknown_response_status` (the mechanism the snapshot-uploads
  lane also uses) because pinning those statuses is the point of the matrix.

No app-side authorization gap was found: every coordinator request to an owner-only operation is 403
and every cross-agency id is 404.

## Task 4 — Real-data run

**Recorded per user ruling (2026-10-17). The full-data run was stopped; the oracle was not re-run
end to end on full data. Steps 3, 4 and 5 are NOT run — do not read them as passed.**

### Step 1 — Oracle is current: RUN ✅
```
bin/golden-numbers /Users/sergiotorres/code/simbe/handoff/takehome/exports --check
golden.json is up to date
```
The exports are git-ignored and therefore absent from a linked worktree, so `bin/golden-numbers --check`
run bare from `.worktrees/w3-1` prints `exports not found:
/Users/sergiotorres/code/simbe/.worktrees/w3-1/handoff/takehome/exports/harbor` (exit 1). Passing the
main checkout's exports dir (above) is how this lane checks the committed `golden.json`.

### Step 2 — Backend real-data specs: SAMPLED SMOKE RUN, NOT THE FULL SUITE ⚠️
`make spec ARGS="--tag real_data"` was started and **stopped after roughly an hour**: every example
reloads ~625k Lakeside rows, so the full run is ~1 h. Per the user ruling it was **not** re-run.

Instead the user ran the `:real_data` specs on a **5% sample of both exports**:

```
20 examples, 18 failures
```
- **Every failure is a count/value mismatch against `spec/real_data/golden.json`** — expected, because
  the oracle asserts full-data counts and a 5% sample cannot equal them.
- **Zero exceptions, zero PG errors, zero 500s.**
- The upload API loaded exactly the sample's rows for **both** agencies.

Conclusion: the real-data **pipeline** (reader → loader/upload → facts → metrics/leads/actions) runs
clean on real-shaped data for Harbor and Lakeside, but the plan's acceptance for Step 2 —
every `:real_data` spec passing for both agencies — is **NOT verified**, and the Lakeside
**< 120 s timings are NOT measured**.

### Step 3 — Browser journey with real files: NOT RUN ❌
Not run (user ruling). It needs the full real exports uploaded through sign-up, which is the full-data
run that was stopped. It would also live under `e2e/journeys/**` (W3-2's `Owns`) or the `@real`
describe in `e2e/signup.spec.ts` (F-SIGNUP's `Owns`), neither of which this lane may edit.
Golden assertions listed in the plan (`3,530`/`496`/`14.1%`, funnel `3,530/918/579/496/400/300`,
Pipeline `90/11/15/321`, coordinators `Dana Ortiz 2,252 · 63.8%` / `overdue 19`, next-actions
`6/22/3/3`, Lakeside `29,740` / `14,860` / `2,487`, third-agency `674`) are **NOT asserted here**.

### Step 4 — Resilience (reload mid-import, kill the container): NOT RUN ❌
Not run (user ruling).

### Step 5 — Latency and screenshots: NOT RUN ❌
The < 500 ms p95 latency assertions on Lakeside and the owner/coordinator/isolation walkthrough are
**NOT measured**; no screenshots were captured for this lane. (UI/brand screenshots for the integration
are W3-3's audit; W3-1 owns no UI.)

### Lane note on the unrun browser work
Task 4 Steps 3–4 are browser journeys. W3-1's `Owns` list has no `e2e/` path: `e2e/journeys/**` and
`e2e/support/**` belong to **W3-2** (its Task 6 asserts exactly the golden numbers listed above), and
`e2e/signup.spec.ts` belongs to **F-SIGNUP**. Under the lane rules this lane cannot author them.

## Task 5 — CI e2e-real job and finish

_(filled in below)_

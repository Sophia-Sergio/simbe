# W3-1 Integration: switch to the real API, parity and coverage

> **For Cursor / OpenCode:** Implement task-by-task. Follow `docs/conventions/`. Stop if blocked — do not replan silently. **Commit after every task** (`chore(integration): task N – <title>`). After all Wave 1–2 lanes are merged, ownership rules relax: fixes may touch any file, **one small PR per fix** referencing the failing check.

**Lane:** W3-1 · **Wave:** 3 (one agent; starts when every Wave 1 lane and B-AGENT/B-MCP are merged)
**Owns:** `lib/tasks/e2e.rake`, `spec/contract/**`, `spec/security/**`, `.env.example` (VITE_API_MODE default), `vite.config.ts` (mode defaults only), `.github/workflows/ci.yml` (add `e2e-real` job), `docs/superpowers/parallel/integration-log.md`
**Depends on (merged):** all Wave 0, Wave 1 and Wave 2 lanes
**Unblocks:** W3-2, W3-3
**Goal:** The frontend talks to the real Rails API by default; every contract operation is exercised by a backend spec; mock fixtures and real responses agree; the role/tenancy matrix is proven; real Harbor/Lakeside data loads and renders.
**Spec:** `docs/superpowers/specs/2026-10/2026-10-14-2100-parallel-build-architecture-design.md`, `…-2101-api-contract-and-mocks-design.md`

## Global Constraints
- The contract is the arbiter: when mock and backend disagree, decide from `contracts/openapi` which is wrong; fix code, or file a CCR if the contract is wrong.
- No fixes by loosening schemas to "make it pass" without a CCR explaining why.

## Review Focus
- Cookie auth through the Vite proxy (SameSite=Lax, CSRF header) works in dev and in CI.
- `e2e:seed` is idempotent and never runs outside development/test.
- Coordinators can't reach owner data through any operation (matrix test), and agency B ids never resolve for agency A.

---

## Task 1: Real-mode default and e2e seeding

- [x] **Step 1:** In the Rails-embedded app the API is already the real one (same origin, no proxy): make sure `.env.example` documents `VITE_API_MODE=real` (default) and `mock` (embedded dev against MSW), and that **Playwright's `real-*` projects** are selected with `E2E_API=real E2E_BASE_URL=$(make ports → web)`. The standalone mock host (`npm run dev:mock`) stays always-mock. Document both in `README.md` ("Mock vs real" section).
- [x] **Step 2: `lib/tasks/e2e.rake`**
```ruby
namespace :e2e do
  desc "Load Alpha for harbor + coordinator logins (development/test only)"
  task seed: :environment do
    abort "e2e:seed is dev/test only" unless Rails.env.development? || Rails.env.test?
    require Rails.root.join("spec/support/export_builder")
    require Rails.root.join("spec/support/alpha_scenario")
    require Rails.root.join("spec/support/alpha_spend")
    agency = Agency.find_by!(slug: "harbor")
    Current.agency = agency
    AlphaScenario.load!(agency)                # replaces; idempotent
    AlphaSpend.load!(agency)
    # logins: erin@harbor.test (owner), dana@harbor.test (coordinator "Dana Ortiz"), jess@harbor.test ("Jess Kim"), priya@harbor.test ("Priya Shah") — password simbe-dev-pass
    { "dana@harbor.test" => "Dana Ortiz", "jess@harbor.test" => "Jess Kim", "priya@harbor.test" => "Priya Shah" }.each do |email, name|
      User.find_or_create_by!(email: email) { |u| u.agency = agency; u.name = name; u.role = "coordinator"; u.coordinator_name = name; u.password = "simbe-dev-pass" }
    end
  end
  desc "Write the Alpha CSVs for browser upload tests"
  task :alpha_files, [:dir] => :environment do |_, a|
    require Rails.root.join("spec/support/export_builder"); require Rails.root.join("spec/support/alpha_scenario")
    FileUtils.cp_r(Dir[File.join(AlphaScenario.copy_dir, "*")], FileUtils.mkdir_p(a[:dir] || Rails.root.join("../e2e/fixtures/alpha")))
  end
end
```
- [x] **Step 3: Verify:** `make up && make setup && docker compose exec web bundle exec rails e2e:seed` twice (idempotent); `curl` sign-in as `erin@harbor.test` and `GET /api/v1/metrics/summary` → `kpis.leads.value == 10`. Commit.

---

## Task 2: Contract coverage = 39/39

- [x] **Step 1:** `make contract-coverage` must print `39/39 operations exercised`. For each unexercised operation add the missing request spec **in the owning lane's spec file** (small PR per lane area) or a spec in `spec/contract/` if no lane owns it (e.g. `GET /agent/usage`).
- [x] **Step 2:** Add `spec/contract/fixture_parity_spec.rb`: load Alpha, sign in as owner/coordinator, call each operation that has an example fixture under `contracts/examples/**`, and compare the real response to the fixture after normalizing ids, timestamps and tokens (`UUID`→`<uuid>`, ISO times→`<time>`). Operations with expected, documented differences (upload report contents, MCP key, agent answer) assert **shape equality** only (same keys and value types). Failures are listed in `docs/superpowers/parallel/integration-log.md` with the chosen resolution (code fix vs CCR).
- [x] **Step 3:** `make spec ARGS=spec/contract` → pass. Commit.

---

## Task 3: Role and tenancy matrix

- [x] **Step 1: Failing spec** `spec/security/role_matrix_spec.rb`: a table of every operation × {signed-out, coordinator, owner, owner-of-another-agency} with the expected status (from the contract: owner-only operations → 403 for coordinators; signed-out → 401 except public operations; other agency's ids → 404). Generated from the bundled OpenAPI (`x-roles` is **not** in the contract, so derive from each operation's documented `403` response: present ⇒ owner-only) and asserted against the real app.
- [x] **Step 2:** Run; fix gaps in the owning lane's code via small PRs. **Step 3:** pass; commit.

---

## Task 4: Real-data run (Harbor + Lakeside) through the sign-up upload

The only real data is `handoff/takehome/exports/` (local only, never committed) and owners load it **by uploading the seven CSVs during sign-up**; this task proves that path end to end against the independent oracle `spec/real_data/golden.json` (`docs/conventions/real-data.md`).

> **User ruling (2026-10-17):** the full `--tag real_data` run was stopped after ~1 h (each example
> reloads ~625k Lakeside rows) and not re-run. Step 1 passed; Step 2 was run on a 5% sample of both
> exports (20 examples, 18 value mismatches vs the full-data oracle, **zero** exceptions/PG errors/500s,
> upload API loaded exactly the sample rows). Steps 3, 4 and 5 and the Lakeside < 120 s timing were
> **not run**. Recorded in [`integration-log.md`](../parallel/integration-log.md).

- [ ] **Step 1: Oracle is current:** `bin/golden-numbers --check` → `golden.json is up to date` (exports present locally).
- [ ] **Step 2: Backend real-data specs:** `make spec ARGS="--tag real_data"` → every `:real_data` spec from B-INGEST, B-METRICS, B-LEADS, B-ACTIONS passes for **both** agencies (Harbor: *attended a consult*, Pacific; Lakeside: *reached records*, Central). Record timings (Lakeside import must be < 120 s).
- [ ] **Step 3: Browser journey with real files** (Playwright `@real`, local, `E2E_API=real`, Rails running with Solid Queue in Puma): sign up `Harbor demo` → step 4 upload `handoff/takehome/exports/harbor/*.csv` → watch progress → open the dashboard and assert against golden: This week `3,530` leads / `496` qualified / `14.1%`; Funnel rows `3,530 / 918 / 579 / 496 / 400 / 300`; Channels `Facebook`, `Google`, … with `unattributed 29.6%` and `outside your main states 14.9%`; Pipeline column counts `90 / 11 / 15 / 321`; Coordinators: `Dana Ortiz 2,252 · 63.8%`, `overdue 19`; Next actions totals `6 / 22 / 3 / 3`. Repeat for **Lakeside** with `Reached medical records` + Central (leads `29,740` in Coordinators totals; This week 12m `14,860` leads / `2,487` qualified). Then sign up a **third** agency with **Harbor's files again** (Mountain, *Submitted an application*) and assert qualified = golden `qualified_all_time.application_submitted` = `674` while the first agency's numbers are unchanged (same data, many agencies, strict isolation).
- [ ] **Step 4: Resilience:** start a Lakeside upload, reload the browser mid-`importing` → the page resumes at the same progress and finishes; stop the `api` container mid-import (`docker compose kill api`), restart → upload ends `failed` (or is swept to `failed` within 30 min), the agency's previous data is intact, and a fresh upload succeeds.
- [ ] **Step 5:** Latency: metrics/board/next-actions/coordinators each < 500 ms on Lakeside (p95 over 20 calls). Walk the UI as Harbor owner, Harbor coordinator and Lakeside owner (isolation: Lakeside owner never sees Harbor names). Record findings and screenshots in `integration-log.md`. Commit.

---

## Task 5: CI `e2e-real` job and finish

- [ ] **Step 1:** Add the `e2e-real` job: `docker compose up -d db api web`, `rails db:setup e2e:seed`, `E2E_API=real make e2e` (all lane e2e specs), upload screenshots as artifacts.
- [ ] **Step 2:** All lane e2e specs pass against the real backend in both viewports (`make e2e` with `E2E_API=real`); anything failing becomes a fix PR (ownership relaxed), logged.
- [ ] **Step 2b:** Restore the dead-code guard: in `knip.json` delete `"rules": { "exports": "warn", "types": "warn" }` (it was relaxed in Wave 0 because the kit and hooks export APIs that Wave-1 lanes consume). `npx knip` must exit 0 with the rules back at error: delete every export that is still unused, do not re-add the relaxation.
- [ ] **Step 3:** `make verify` → exit 0; `make contract-coverage` → `39/39`. Commit; open PR. Hand off to W3-2/W3-3.

## Done when (acceptance commands)
```bash
make contract-coverage                                   # 39/39 operations exercised
make spec ARGS="spec/contract spec/security spec/isolation"
bin/golden-numbers --check && make spec ARGS="--tag real_data"   # real exports present locally; both agencies vs the oracle
E2E_API=real make e2e                                    # every lane e2e spec, desktop + mobile
docker compose exec web bundle exec rails e2e:seed && docker compose exec web bundle exec rails e2e:seed   # idempotent
make verify
```

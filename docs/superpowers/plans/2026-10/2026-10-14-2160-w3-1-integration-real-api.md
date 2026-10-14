# W3-1 Integration: switch to the real API, parity and coverage

> **For Cursor / OpenCode:** Implement task-by-task. Follow `docs/conventions/`. Stop if blocked — do not replan silently. **Commit after every task** (`chore(integration): task N – <title>`). After all Wave 1–2 lanes are merged, ownership rules relax: fixes may touch any file, **one small PR per fix** referencing the failing check.

**Lane:** W3-1 · **Wave:** 3 (one agent; starts when every Wave 1 lane and B-AGENT/B-MCP are merged)
**Owns:** `backend/lib/tasks/e2e.rake`, `backend/spec/contract/**`, `backend/spec/security/**`, `frontend/.env*`, `frontend/vite.config.ts` (mode defaults only), `.github/workflows/ci.yml` (add `e2e-real` job), `docs/superpowers/parallel/integration-log.md`
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

- [ ] **Step 1:** `frontend/.env.development` → `VITE_API_MODE=real` (mock mode stays available: `VITE_API_MODE=mock`); Vite proxy targets `api:3000`; document both in `README.md` (owned by lane maintainers; append a "Mock vs real" section).
- [ ] **Step 2: `backend/lib/tasks/e2e.rake`**
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
    FileUtils.cp_r(Dir[File.join(AlphaScenario.copy_dir, "*")], FileUtils.mkdir_p(a[:dir] || Rails.root.join("../frontend/e2e/fixtures/alpha")))
  end
end
```
- [ ] **Step 3: Verify:** `make up && make setup && docker compose exec api bundle exec rails e2e:seed` twice (idempotent); `curl` sign-in as `erin@harbor.test` and `GET /api/v1/metrics/summary` → `kpis.leads.value == 10`. Commit.

---

## Task 2: Contract coverage = 38/38

- [ ] **Step 1:** `make contract-coverage` must print `38/38 operations exercised`. For each unexercised operation add the missing request spec **in the owning lane's spec file** (small PR per lane area) or a spec in `backend/spec/contract/` if no lane owns it (e.g. `GET /agent/usage`).
- [ ] **Step 2:** Add `backend/spec/contract/fixture_parity_spec.rb`: load Alpha, sign in as owner/coordinator, call each operation that has an example fixture under `contracts/examples/**`, and compare the real response to the fixture after normalizing ids, timestamps and tokens (`UUID`→`<uuid>`, ISO times→`<time>`). Operations with expected, documented differences (upload report contents, MCP key, agent answer) assert **shape equality** only (same keys and value types). Failures are listed in `docs/superpowers/parallel/integration-log.md` with the chosen resolution (code fix vs CCR).
- [ ] **Step 3:** `make spec ARGS=spec/contract` → pass. Commit.

---

## Task 3: Role and tenancy matrix

- [ ] **Step 1: Failing spec** `backend/spec/security/role_matrix_spec.rb`: a table of every operation × {signed-out, coordinator, owner, owner-of-another-agency} with the expected status (from the contract: owner-only operations → 403 for coordinators; signed-out → 401 except public operations; other agency's ids → 404). Generated from the bundled OpenAPI (`x-roles` is **not** in the contract, so derive from each operation's documented `403` response: present ⇒ owner-only) and asserted against the real app.
- [ ] **Step 2:** Run; fix gaps in the owning lane's code via small PRs. **Step 3:** pass; commit.

---

## Task 4: Real-data run (Harbor + Lakeside)

- [ ] **Step 1:** Load real exports (local only; git-ignored): `docker compose run --rm -v "$PWD/harbor-takehome:/harbor-takehome:ro" api bundle exec rails "snapshot:load[harbor,/harbor-takehome/exports/harbor]"` and `…lakeside…`; `rails "spend:sample[harbor]"`, `…lakeside…`; create owners for both agencies in `db/seeds.rb`-style dev seeds (already seeded).
- [ ] **Step 2:** Check numbers against the take-home facts: Harbor leads `3530`; qualified (attended consult) `496`; unattributed `29.6%`; out-of-area `14.9%`; Dana Ortiz `2252` leads (`63.8%`); Lakeside leads `29740`. Check endpoint latency (< 500 ms p95 on Lakeside for metrics/board).
- [ ] **Step 3:** Walk the UI as Harbor owner and as a Harbor coordinator and as Lakeside owner (isolation: Lakeside owner never sees Harbor names); record findings and screenshots in `integration-log.md`. Commit.

---

## Task 5: CI `e2e-real` job and finish

- [ ] **Step 1:** Add the `e2e-real` job: `docker compose up -d db api web`, `rails db:setup e2e:seed`, `E2E_API=real make e2e` (all lane e2e specs), upload screenshots as artifacts.
- [ ] **Step 2:** All lane e2e specs pass against the real backend in both viewports (`make e2e` with `E2E_API=real`); anything failing becomes a fix PR (ownership relaxed), logged.
- [ ] **Step 3:** `make verify` → exit 0; `make contract-coverage` → `38/38`. Commit; open PR. Hand off to W3-2/W3-3.

## Done when (acceptance commands)
```bash
make contract-coverage                                   # 38/38 operations exercised
make spec ARGS="spec/contract spec/security spec/isolation"
E2E_API=real make e2e                                    # every lane e2e spec, desktop + mobile
docker compose exec api bundle exec rails e2e:seed && docker compose exec api bundle exec rails e2e:seed   # idempotent
make verify
```

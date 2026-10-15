# Rails monolith with embedded React and backend packs (supersedes the `backend/` + `frontend/` split) — Design

**Status:** Approved (owner decision, 2026-10-14) · **Supersedes:** the repo layout in specs `2000`, `2100`, `2101`, `2102`, `2200` (their product and process decisions stand) · **Reference:** appketing (`app/packs/*`, `app/javascript`, `vite_rails`, `config/application.rb` pack autoload, `handoff/`, `docs/`)

## Goal
One Rails application at the repository root that serves the React UI itself (no separate frontend project or server), organized into **packs** for the backend exactly like appketing, with the docs, handoff material and contracts reordered inside the same project.

## Decisions (answers given by the owner)
1. **React is embedded with `vite_rails`, without Inertia.** Rails (full Rails, not API-only) renders one shell page (`SpaController` + `layouts/application.html.erb` with `vite_client_tag`, `vite_react_refresh_tag`, `vite_javascript_tag "application"`, `csrf_meta_tags`); React Router runs in the browser; data comes from the `/api/v1` JSON contract through the typed hooks. Same origin, one deployable, no proxy. *Why not Inertia:* it would move routing/guards server-side and make every screen need a running Rails (or a fake Inertia host), which would undo the mock-first parallel frontend lanes and the OpenAPI/MSW design.
2. **Frontend code lives in `app/javascript/`** (not inside packs): `entrypoints/application.tsx`, `app/` (registry, router, auth, shell), `api/` (client, generated types, hooks), `mocks/` (MSW), `components/{ui,shared}`, `hooks/`, `lib/`, `styles/`, `test/`, and **`features/<lane>/`** (one folder per frontend lane, auto-registered by `features/*/feature.ts`).
3. **Backend is organized in packs** (`app/packs/<pack>/app/{models,controllers,services,serializers,jobs,mailers}`), autoloaded **and** eager-loaded from `config/application.rb` (appketing's snippet), plus per-pack extension points loaded by the core:
   - `app/packs/<pack>/config/routes/*.rb` → inside `namespace :api { namespace :v1 }`
   - `app/packs/<pack>/config/routes_root/*.rb` → routes outside `/api/v1` (e.g. `/mcp/:slug`)
   - `app/packs/<pack>/config/rack_attack/*.rb` → throttles (`config/initializers/rack_attack.rb` globs them)
   - core, non-pack code stays in `app/` (`Current`, `ApplicationRecord`, `AgencyScoped`, `Api::BaseController`, `SpaController`, `Channels::Normalizer`, `AgencyMilestones`).
4. **Packs** (one owner lane per pack where possible):

| Pack | Contains | Lane(s) |
|---|---|---|
| `identity` | `Agency`, `User`, `AuthSession`, `Invitation`; sessions, me, signup, agency, team, invitations, coordinator-names endpoints; `Signup::*`; `InvitationMailer` | W0-3 (models, auth), B-ACCOUNT |
| `connection` | `AdConnection`, ad-connections endpoints | B-ACCOUNT |
| `ingest` | `Snapshot`, `SnapshotUpload`; `Snapshot::{Constants,Reader,AsOf,Facts}` (W0-3), `Validator`, `Importer`, `Progress`, `Storage`, jobs, upload/snapshot endpoints | W0-3 (shared pieces), B-INGEST |
| `leads` | `Lead`, `StageEvent`, `Contact`, `ScreenerAnswer`, `WebSession`, `Appointment`, `Application`, `LeadFact`, `ActionCompletion`; `Leads::{Access,Queues}` (W0-3), `Status/Board/List/Detail/Masking/Summarizer` (B-LEADS), `NextActions/CoordinatorStats` + completions/coordinators endpoints (B-ACTIONS) | W0-3, B-LEADS, B-ACTIONS |
| `metrics` | `AdSpendDay`; `Metrics::*`, `Spend::*`; metrics and recommendations endpoints | W0-3 (model), B-METRICS |
| `agent` | `AgentConversation`, `AgentMessage`, `AiUsageEvent`; `Ai::*`, `Agent::*`; agent endpoints | W0-3 (models), B-AGENT |
| `mcp` | `McpKey`; `Mcp::*`; `/mcp/:slug` and settings endpoints | W0-3 (model), B-MCP |

   Cross-pack calls go through the called pack's public services (`Leads::Queues`, `Snapshot::Facts`, `Metrics::Summary`, …), never through another pack's private classes or tables from a controller; `boundaries:check` keeps a ratchet list of allowed cross-pack constants (entries only come out).
5. **Folder structure replicated from appketing:** Rails root = repo root. `docs/` (conventions, design, operations, superpowers specs/plans/parallel), **`handoff/`** (`design/` = the former `design_handoff_simbe`, `takehome/` = the former `harbor-takehome`, with the local-only `exports/`), `contracts/` (OpenAPI + examples; read by Vite aliases, rake tasks and CI), `e2e/` (Playwright), `spec/`, `lib/tasks/`, `bin/` (Rails stubs + lane/worktree/oracle tooling), `public/brand/simbe-mark.png`.
6. **Dev topology:** `docker-compose.yml` services `db` (Postgres 16), `web` (Rails + Puma + Solid Queue in Puma, port 3000) and `vite` (`bin/vite dev`, port 3036), all from one `Dockerfile.dev` that has Ruby **and** Node 22 (copied from the Node image like appketing), so `docker compose exec web …` can run Rails, Vitest, ESLint and Playwright. **Frontend-only lanes need no Docker:** `npm run dev:mock` serves the same React app from a standalone Vite host (`app/javascript/mock-host/index.html`, MSW worker in its own `publicDir`) on port 5173 with the mock API.
7. **Auth and CSRF are unchanged:** HttpOnly cookie sessions (`auth_sessions`), non-GET `/api` requests require `X-Requested-With: simbe`; `Api::BaseController < ActionController::API` (no sessions/CSRF middleware surprises) coexists with the full-Rails `ApplicationController` used by `SpaController`.
8. **Production:** one image, built like appketing's (`rails assets:precompile` runs the Vite build; `public/vite/` is served by Rails/Thruster; non-root; jemalloc); one Fly app; the SPA fallback is `SpaController` rendering the layout (so asset hashes are always current). `mockServiceWorker.js` never ships (it lives only in the mock host's `publicDir`).
9. **Ownership by pack/feature:** backend lanes own pack directories (or distinct files inside the shared `leads`/`identity` packs); frontend lanes own `app/javascript/features/<lane>/**` + their `e2e/<lane>.spec.ts`; Wave 0 owns the core and the shared kit. `bin/lane check` and `check-ownership.sh` keep working unchanged.
10. **Real data path:** exports live at `handoff/takehome/exports/{harbor,lakeside}/` in the main checkout (git-ignored; worktrees don't contain them), found via `SIMBE_EXPORTS_DIR`, which `bin/worktree-env` points at the main checkout; golden numbers at `spec/real_data/golden.json`.

## Non-goals
Inertia, server-side rendering, micro-frontends, Devise (our own session auth stays), splitting React per pack, Packwerk (boundaries rake + convention instead), changing any product/behavior decision in the other specs.

## Acceptance criteria
1. `bin/rails runner 'puts Rails.autoloaders.main.dirs.grep(%r{app/packs}).size'` prints ≥ 7 (every pack's `app/models` etc. autoloaded) and `bin/rails boundaries:check` exits 0.
2. `curl -s localhost:3000/ | grep -c 'vite'` ≥ 1 and `curl -s localhost:3000/pipeline | grep -q '<div id="root">'` (shell served for client routes); `curl -s -o /dev/null -w '%{http_code}' localhost:3000/api/v1/me` → `401`.
3. `ls app/packs` lists `agent connection identity ingest leads mcp metrics`; `ls handoff` lists `design takehome`; `test -f spec/real_data/golden.json && bin/golden-numbers --check` succeed; `git ls-files | grep -E '^(backend|frontend)/' | wc -l` prints `0`.
4. `npm run dev:mock` (no Docker) serves the app at `localhost:5173` and `curl -s localhost:5173 | grep -c 'id="root"'` ≥ 1; `npx vitest run` passes from the repo root.
5. `bash docs/superpowers/parallel/check-ownership.sh` reports 0 conflicts across all lanes with the new ownership lines, and `bin/lane check --lane F-WEEK --base HEAD` passes on an untouched tree.
6. `docker build -t simbe:test .` succeeds and the container serves `/up`, the SPA shell at `/` and `401` at `/api/v1/me` (production image criteria from spec `2200`, updated).

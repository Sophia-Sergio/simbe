# Simbe

Analytics for surrogacy agencies: connects ad spend (Meta, Google) to the recruiting funnel
(screener → application → consult → records → accepted), with an "Ask Simbe" AI agent.

- One Rails 8 app at the repo root (backend **packs** in `app/packs/<pack>/app/…`) · Postgres 16 · Solid Queue in Puma
- React 19 + TypeScript + Tailwind embedded with `vite_rails` in `app/javascript` (no Inertia; React Router + the `/api/v1` OpenAPI contract)
- Agent: Anthropic Claude (key reused from `../personal/appketing`, see `.env.example`)

## Run it

```bash
cp .env.example .env     # then set ANTHROPIC_API_KEY (reuse the value from ../personal/appketing/.env)
make up                  # db + web (Rails, Puma, Solid Queue) + vite, in Docker
make setup               # db:create db:migrate db:seed (first run)
make ports               # the host ports Docker picked: web, vite, db
npm run dev:mock         # no Docker, no Rails: the React app + mock API on http://127.0.0.1:5173 (Node 22)
```

A linked git worktree gets its own isolated stack: `make worktree-env` (run for you by `bin/lane start`) writes a `.env` with its own compose project, database and ports.

| Command | What |
|---|---|
| `make spec ARGS=spec/requests/spa_spec.rb` | RSpec (Docker, `simbe_test` database) |
| `make web-test` / `npx vitest run` | Vitest (host, Node 22) |
| `make e2e` | Playwright, `mock-desktop` and `mock-mobile` projects (`E2E_API=real E2E_BASE_URL=… make e2e` for the real stack) |
| `make verify` | Everything CI runs: ownership + health-data guards, rubocop, brakeman, bundler-audit, boundaries, specs, lint, typecheck, `npm audit --omit=dev`, Vitest |

## Mock vs real

The frontend reads its API mode from `VITE_API_MODE` (`.env.example`):

- **`real` (default)** — the Rails-embedded app talks to `/api/v1` on its own origin (no proxy, no mocks). This is what runs in Docker: `make up` → the app at the `web` port from `make ports`.
- **`mock`** — the Rails dev server starts MSW in the browser instead of calling Rails (`VITE_API_MODE=mock` in `.env`, restart `web`). Useful for frontend work with no backend data; never enabled in a build (`__MOCKS_ENABLED__` is only true for `vite serve` with `mock`).
- **`npm run dev:mock`** — the standalone mock host on :5173. It is **always** mock (`vite.mock.config.ts` forces `VITE_API_MODE=mock`), needs no Rails and no Docker, and is what the Playwright `mock-*` projects and Vitest use.

Playwright picks its projects from `E2E_API`: without it, `mock-desktop`/`mock-mobile` start the standalone mock host themselves; with `E2E_API=real` and a base URL it targets a running Rails stack (both viewports):

```bash
E2E_API=real E2E_BASE_URL="http://127.0.0.1:$(docker compose port web 3000 | cut -d: -f2)" make e2e
```

The real-export journeys are tagged/skipped by construction (the exports are local-only), so the same command is safe in CI.

## Where things are

| Path | What |
|------|------|
| `app/packs/<pack>/` | Backend packs: identity, connection, ingest, leads, metrics, agent, mcp (models, controllers, services, serializers, jobs) |
| `app/javascript/` | The React app: `app/` (shell, registry), `api/`, `mocks/`, `components/`, `features/<lane>/` |
| `contracts/` | OpenAPI 3.1 contract + Alpha-derived examples (single source of truth for `/api/v1`) |
| `e2e/` | Playwright specs (mock and real projects) |
| `handoff/design/` | Hi-fi design reference (README, screenshots, HTML prototype) |
| `handoff/takehome/` | Source brief, data model docs, sample CSV exports (**exports are git-ignored**) |
| `docs/conventions/` | Binding coding rules |
| `docs/design/brand.md` | Colors, type, shapes, logo (simbefamily.com) |
| `docs/operations/` | Deploy, secrets, rollback, backups runbooks |
| `docs/superpowers/specs/`, `plans/`, `parallel/` | Design specs, implementation plans, the lane matrix and playbook for building with many agents |
| `bin/` | Rails stubs plus `lane`, `worktree-env`, `golden-numbers`, `generate-sample-export`, `guard-no-health-data`, `setup-github` |

Start with [`docs/superpowers/README.md`](docs/superpowers/README.md) for build order and how to execute plans.

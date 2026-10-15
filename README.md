# Simbe

Analytics for surrogacy agencies: connects ad spend (Meta, Google) to the recruiting funnel
(screener → application → consult → records → accepted), with an "Ask Simbe" AI agent.

- One Rails 8 app at the repo root (backend **packs** in `app/packs/<pack>/app/…`) · Postgres 16 · Solid Queue in Puma
- React 19 + TypeScript + Tailwind embedded with `vite_rails` in `app/javascript` (no Inertia; React Router + the `/api/v1` OpenAPI contract)
- Agent: Anthropic Claude (key reused from `../personal/appketing`, see `.env.example`)

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

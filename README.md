# Simbe

Analytics for surrogacy agencies: connects ad spend (Meta, Google) to the recruiting funnel
(screener → application → consult → records → accepted), with an "Ask Simbe" AI agent.

- Backend: Rails (API) · Postgres
- Frontend: React + TypeScript + Tailwind
- Agent: Anthropic Claude (key reused from `../personal/appketing`, see `.env.example`)

## Where things are

| Path | What |
|------|------|
| `handoff/design/` | Hi-fi design reference (README, screenshots, HTML prototype) |
| `handoff/takehome/` | Source brief, data model docs, sample CSV exports (exports are git-ignored) |
| `docs/conventions/` | Binding coding rules |
| `docs/superpowers/specs/` | Design specs |
| `docs/superpowers/plans/` | Implementation plans (hand these to Cursor / OpenCode) |

Start with [`docs/superpowers/README.md`](docs/superpowers/README.md) for build order and how to execute plans.

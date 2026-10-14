# Simbe — Agent Rules (OpenCode / Cursor / any coding agent)

Mirror of `CLAUDE.md`. You are the **implementer**: execute plans in `docs/superpowers/plans/` task by task.
Detailed rules live in `docs/conventions/`.

## Required reading

At the start of **every session**, read every file listed in [`docs/conventions/README.md`](docs/conventions/README.md). They are binding.
For product/UI questions read `design_handoff_simbe/README.md` (source of truth for UI) and `harbor-takehome/docs/data-model.md` (source of truth for data).

## Tool roles

| Tool | Role |
|------|------|
| **Claude Code** | Brainstorming, design specs, architecture, writing plans, code review |
| **Cursor / OpenCode** | Implements plans task-by-task; runs verifications; commits after each task |

- Specs: `docs/superpowers/specs/YYYY-MM/YYYY-MM-DD-HHmm-topic-design.md` (decisions, written before plans).
- Plans: `docs/superpowers/plans/YYYY-MM/YYYY-MM-DD-HHmm-feature-name.md` (source of truth while implementing; do not replan unless blocked).
- Build order and dependencies: [`docs/superpowers/README.md`](docs/superpowers/README.md).
- Work on a feature branch in a git worktree (`.worktrees/<branch>`); never commit feature work on `main`. Finish by opening a pull request.
- When telling the user where a spec/plan is, give a markdown link to its absolute path labelled with the file name, prefixed `Spec:` or `Plan:`.

## Stack

Rails 8 API-only (`backend/`) · PostgreSQL 16 · React + TypeScript + Vite + Tailwind (`frontend/`) · Anthropic Claude for the agent. Everything runs in Docker Compose.

## Non-negotiables

1. **Agency isolation.** Every tenant row has `agency_id`; every query goes through `Current.agency` scoping. See `docs/conventions/multi-tenancy.md`.
2. **Screener answers are health data.** Encrypted at rest, never logged, never sent to the AI provider verbatim, visible only to the assigned coordinator. See `docs/conventions/sensitive-data.md`.
3. **Never commit the exports** (`harbor-takehome/exports/*/` is git-ignored) or any `.env`.
4. **Snapshot loads are idempotent**: re-loading a newer full export replaces the agency's data in one transaction and never double counts.
5. **Qualified is config, not a column**: `agencies.qualified_milestone`.
6. **Commit after every task** — one commit per plan task, message names the task. Run `make verify` (lint + tests + security scans) before committing; do not commit while it fails.
7. **Verification commands use Docker** (`docker compose exec api bundle exec …`, `make` targets), never host `rails`/`bundle`/`npm`.
8. **UI is not done until seen**: run the app and look at desktop (>=860px) and mobile (<860px) screenshots against `design_handoff_simbe/screenshots/`.
9. **Single-flight actions**: a clicked mutation cannot run twice (`useAsyncAction` on the front, idempotency/lock on the back).

## Testing

RSpec + FactoryBot (backend), Vitest + Testing Library + Playwright (frontend). One owner spec per HTTP path (request spec); no duplicate service specs. See `docs/conventions/testing.md`.

## Writing specs and plans

- Spec acceptance criteria must be runnable commands, may only assert what the spec's Findings claim, and must not contradict its Decisions/Non-goals.
- Plans start with the template in `docs/superpowers/plans/README.md`, include a file map, give exact code and commands, and end every task with a verifiable step.

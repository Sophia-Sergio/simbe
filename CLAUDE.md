# Simbe — Project Rules

Entry point for **Claude Code**, mirrored for OpenCode in `AGENTS.md` and Cursor in `.cursor/rules/`.
Detailed rules live in `docs/conventions/`.

## Required reading

At the start of **every session**, read every file listed in [`docs/conventions/README.md`](docs/conventions/README.md). They are binding.
For product/UI questions read `handoff/design/README.md` (layout, screens, behavior) and **`docs/design/brand.md`** (colors, fonts, shapes, logo from simbefamily.com — overrides the handoff's brand values) and `handoff/takehome/docs/data-model.md` (source of truth for data).

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

One Rails 8 app at the repo root (full Rails; backend **packs** in `app/packs/<pack>/app/...`, appketing-style) · PostgreSQL 16 · Solid Queue in Puma · React 19 + TypeScript + Tailwind embedded with `vite_rails` in `app/javascript` (no Inertia; React Router + the `/api/v1` contract) · Anthropic Claude for the agent. Layout: `docs/` (conventions, design, operations, superpowers), `handoff/` (design + take-home material), `contracts/` (OpenAPI), `e2e/`. Rails/DB run in Docker Compose; Node-only tooling and frontend-only lanes run on the host (see `docs/conventions/development.md`).

## Non-negotiables

1. **Agency isolation.** Every tenant row has `agency_id`; every query goes through `Current.agency` scoping. See `docs/conventions/multi-tenancy.md`.
2. **Screener answers are health data.** Encrypted at rest, never logged, never sent to the AI provider verbatim, visible only to the assigned coordinator. See `docs/conventions/sensitive-data.md`.
3. **Never commit the exports** (`handoff/takehome/exports/*/` is git-ignored) or any `.env`.
4. **Snapshot loads are idempotent**: re-loading a newer full export replaces the agency's data in one transaction and never double counts.
5. **Qualified is config, not a column**: `agencies.qualified_milestone`.
6. **Commit after every task** — one commit per plan task, message names the task. Run `make verify` (lint + tests + security scans) before committing; do not commit while it fails.
7. **Verification commands use Docker** (`docker compose exec web bundle exec …`, `make` targets), never host `rails`/`bundle`/`npm`.
8. **UI is not done until seen**: run the app and look at desktop (>=860px) and mobile (<860px) screenshots against `handoff/design/screenshots/`.
9. **Single-flight actions**: a clicked mutation cannot run twice (`useAsyncAction` on the front, idempotency/lock on the back).

## Parallel lanes (many agents)

The build is split into 32 independent lanes: [`docs/superpowers/parallel/README.md`](docs/superpowers/parallel/README.md) (matrix, lane rules) and [`playbook.md`](docs/superpowers/parallel/playbook.md) (how to run them with Cursor, OpenCode and Claude Code). Use `bin/lane start <LANE>` / `check` / `pr` / `status` / `stop`. Touch **only** the files in your lane plan's `Owns` list; shared changes go through a Contract Change Request. The only real data is `handoff/takehome/exports/` (local-only; golden numbers in `spec/real_data/golden.json`; see `docs/conventions/real-data.md`).

## Pull requests outside the lanes

`main` requires a `claude-review` status (plus the other checks, linear history, admins included). Lane PRs get it from `bin/lane pr` after the batch "go". For any other PR that Claude Code opened at the owner's request (docs, fixes, tooling), Claude Code posts it itself, with these limits:

- Verify the exact head first (related specs, lint, `make verify-changed`, a gitleaks scan, UI seen at desktop and mobile when it changed) and say what the status rests on.
- Post once per head with `claude-review <PR>` (a shell function in the owner's `~/.zshrc` that sets `claude-review=success` on the PR's current head). A new commit means verify again and post again.
- Only for PRs Claude Code opened and verified. Never for someone else's PR or an unverified one.
- Posting is not merging: do not merge or enable auto-merge unless the owner asks. Never relax branch protection or add scanner exceptions to get a status through.

## Testing

RSpec + FactoryBot (backend), Vitest + Testing Library + Playwright (frontend). One owner spec per HTTP path (request spec); no duplicate service specs. See `docs/conventions/testing.md`.

## Writing specs and plans

- Spec acceptance criteria must be runnable commands, may only assert what the spec's Findings claim, and must not contradict its Decisions/Non-goals.
- Plans start with the template in `docs/superpowers/plans/README.md`, include a file map, give exact code and commands, and end every task with a verifiable step.

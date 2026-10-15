# Playbook: building Simbe with many agents (Cursor, OpenCode, Claude Code)

How to actually run the 32 lanes with the three tools, in what order, with how many agents, and how to keep it orderly. Lane list and rules: [`README.md`](./README.md). Everything below uses `bin/lane` (start, check, pr, status, stop).

## 1. The idea in one paragraph

You are the **conductor**. Claude Code is the **orchestrator and reviewer** (critical-path lanes, PR review against the plan, integration). Cursor and OpenCode are the **workers**: each takes one lane in its own git worktree, follows its plan task by task, commits after every task, and opens one PR. Lanes can't collide (disjoint `Owns`, extension points, contract-first, mock API), so the only real limits are your **review bandwidth** and your **machine**.

## 2. Who does what

| Tool | Best for | Why |
|---|---|---|
| **Claude Code** (this session) | Wave 0 critical path (W0-1, W0-3, W0-5), B-AGENT (Anthropic API expertise), W3-1 integration, **reviewing every PR**, CCRs, merge/rebase decisions | Holds the whole spec set in context; strongest at cross-cutting design and review; can also run lanes itself via sub-agents in worktrees |
| **Cursor** | Frontend lanes with heavy visual iteration (kit, shells, screens, panels) | Fast edit–look loop in the editor, composer/agent mode, you see the browser while it works; `.cursor/rules` load automatically |
| **OpenCode** | Backend lanes, contract/mock tooling, CI/CD, long unattended runs; many parallel sessions (tmux panes) and cheap-model lanes | Terminal-native, reads `AGENTS.md` + `opencode.json`, easy to run headless (`opencode run "…"`) and to pick a different model per lane |

Suggested assignment (change freely — any tool can run any lane, the plans are tool-agnostic):

| Wave | Lane | Tool | Model tier |
|---|---|---|---|
| 0 | W0-1 scaffold | Claude Code | top (everything waits on it) |
| 0 | W0-7 CI/CD | OpenCode | mid |
| 0 | W0-2 contract tooling + mocks (tasks 4–7 split over 2 sessions) | OpenCode ×2 | mid |
| 0 | W0-3 backend core | Claude Code | top |
| 0 | W0-4A kit primitives, W0-4B kit data-viz | Cursor ×2 | mid |
| 0 | W0-5 app core | Claude Code | top |
| 0 | W0-6A desktop shell, W0-6B mobile shell | Cursor ×2 | mid |
| 1 | B-INGEST | OpenCode | top (async jobs, 69 MB files, real-data oracle) |
| 1 | B-METRICS, B-LEADS, B-ACTIONS | OpenCode ×3 | mid/top |
| 1 | B-ACCOUNT | OpenCode | mid |
| 1 | F-LEADPANEL, F-PIPELINE, F-SIGNUP, F-DATA, F-AGENT | Cursor ×5 | mid/top (most UI states) |
| 1 | F-WEEK, F-FUNNEL, F-CHANNELS, F-NEXTACTIONS | Cursor ×4 | mid |
| 1 | F-COORDINATORS, F-SEARCH, F-SETTINGS, F-CONNECT | OpenCode ×4 | cheap/mid (small, well-specified) |
| 2 | B-AGENT | Claude Code | top |
| 2 | B-MCP | OpenCode | mid |
| 3 | W3-1 integration | Claude Code | top |
| 3 | W3-2 journeys, W3-3 audit | OpenCode + Cursor | mid |

## 3. One-time setup (≈ 30 min)

1. **Merge the planning PRs** (#1 then #2) so `origin/main` contains the specs, plans, contract, `bin/lane`, `bin/worktree-env`, CI plan. Worktrees branch from `origin/main`.
2. **Main checkout `.env`** (git-ignored): copy `.env.example`; `ANTHROPIC_API_KEY` from `../personal/appketing/.env`. `bin/worktree-env` copies it into each worktree and isolates the Docker stack.
3. **Tools**: Docker Desktop (give it ≥ 8 GB RAM if you will run more than ~4 backend stacks), Node 22, Python 3, `gh` (logged in), Cursor, OpenCode (`opencode` on PATH), Claude Code.
4. **Machine budget**: a frontend lane in mock mode needs **only Node** (no Docker). A backend lane needs one Docker stack (db + api, ~1–1.5 GB). Rule of thumb: ≤ 5 backend stacks + any number of frontend lanes on a 16 GB laptop.
5. **GitHub** (once W0-7 has merged): `bin/setup-github` (dry run) then `bin/setup-github --apply` (labels, squash-only merges, branch protection with the CI jobs as required checks). Add `FLY_API_TOKEN` to the `production` environment only when you are ready to deploy.
6. **Real data**: confirm `handoff/takehome/exports/{harbor,lakeside}/` exist locally and `bin/golden-numbers --check` says up to date. They never leave your machine (CI has none; agents must not paste rows anywhere).

## 4. Running one lane (the loop every agent follows)

```bash
bin/lane list                          # lanes, waves, plans
bin/lane start F-WEEK                  # worktree .worktrees/f-week, branch lane/F-WEEK-…, isolated docker env, prompt printed
cd .worktrees/f-week                   # open THIS folder in Cursor / run `opencode` or `claude` here
# paste the printed prompt (also saved in .lane-prompt.md). The agent: reads plan+spec+conventions, TDD per task, commit per task,
# runs the "Done when" commands and `make verify`, then:
bin/lane check                         # only files in the plan's Owns list changed
bin/lane pr                            # pushes, opens the PR with the lane checklist (labels: lane, wave-N)
bin/lane stop F-WEEK                   # after merge: tears down the worktree's docker stack and removes the worktree
bin/lane status                        # anyone, any time: lane → not started / in progress / PR open / merged
```

- **One lane = one worktree = one agent session = one PR.** Never two agents in the same worktree.
- Agents **commit after every task** with the message pattern in their plan, so `git log` in the lane branch reads like the plan.
- Stuck? The agent stops and asks (plan rule). If the blocker is outside the lane (missing contract field, kit prop, shared file) → file a **Contract Change Request** (issue form, label `ccr`) or a **Lane blocked** issue; don't work around it.
- Frontend lanes: develop with `VITE_API_MODE=mock` (scenarios `?mock=empty|error|slow|coordinator|new|loading`). Backend lanes: `AlphaScenario.load!` in specs, `RealData.load!` + golden oracle locally.

### Tool specifics

**Cursor** — open the worktree folder as its own window (one window per lane). `.cursor/rules/*.mdc` (conventions, lane rules, implement-plans) load automatically. Use Agent mode; paste the lane prompt; keep one chat per lane; leave the app running (`npm run dev`) in the integrated terminal so you can watch the screen while it iterates. Run `bin/lane check` before `bin/lane pr`.

**OpenCode** — `cd` into the worktree and run `opencode`; it reads `AGENTS.md` automatically and `opencode.json` adds `docs/conventions/*.md`, `docs/design/brand.md` and the lane README to its context, with a permission baseline (asks before unknown shell commands, denies force-push, `rm -rf`, pushes to `main`). Unattended: `opencode run "$(cat .lane-prompt.md)"` inside a tmux pane per lane. Pick the model per lane (cheaper for COORDINATORS/SEARCH/SETTINGS/CONNECT, strongest for INGEST). Use `bin/lane status` in a spare pane as your dashboard.

**Claude Code** — three modes: (a) run a Wave 0 lane yourself in its worktree (`cd .worktrees/w0-1 && claude`); (b) **review** every PR (below); (c) **orchestrate**: ask me "run lanes F-FUNNEL, F-CHANNELS and F-COORDINATORS with sub-agents" and I'll start them in parallel with `isolation: worktree`, each following its plan, then report back — good for small lanes when your editors are busy (higher token cost; I'll confirm before launching more than 3).

## 5. Wave-by-wave

**Wave 0 — substrate (the only part with a critical path).**
1. `W0-1` alone (Claude Code). Merge. *Everyone else waits for this.*
2. Start in parallel as soon as it merges: `W0-2` (OpenCode, 2 sessions), `W0-3` (Claude Code), `W0-4A` (Cursor), `W0-7` (OpenCode) — **4–5 agents**.
3. When `W0-4A` merges → `W0-4B` (Cursor). When `W0-2` + `W0-4A` merge → `W0-5` (Claude Code). When `W0-5` merges → `W0-6A` + `W0-6B` (Cursor ×2).
4. **Gate to Wave 1** (check, don't assume): `make verify` green on `main`; `make contract` green; `/__kit` renders at both widths; sign in as owner and coordinator in mock mode shows the desktop and mobile shells; `AlphaScenario.load!` and `make spec ARGS="--tag real_data"` (exports present) pass; `bin/lane status` shows W0-* merged.

**Wave 1 — fan out (up to 18 lanes), but ramp in batches so review keeps up.**
- **Batch A (start together, ~6):** B-INGEST, B-METRICS, B-LEADS (backend, OpenCode) · F-WEEK, F-PIPELINE, F-SIGNUP (Cursor).
- **Batch B (as slots free up, ~6):** B-ACTIONS, B-ACCOUNT · F-LEADPANEL, F-FUNNEL, F-CHANNELS, F-DATA.
- **Batch C:** F-NEXTACTIONS, F-COORDINATORS, F-SEARCH, F-SETTINGS, F-AGENT, F-CONNECT (+ B-MCP early if you like).
- Frontend lanes don't wait for backend lanes (mock API). Merge each PR as soon as it is green and reviewed; order doesn't matter.

**Wave 2:** B-AGENT (needs B-METRICS, B-LEADS, B-ACTIONS merged), B-MCP (can start in Wave 1).

**Wave 3:** W3-1 (flip to real API, contract coverage 39/39, role matrix, **real-data run through the sign-up upload** vs `golden.json`) → then W3-2 (journeys) ∥ W3-3 (mobile/a11y/brand audit). Then the first deploy (`docs/operations/deploy.md`, owner-run).

## 6. The review loop (Claude Code)

For each lane PR, in this order — the plan's "Done when" block is the checklist:
1. `bin/lane status` → pick the PR; `gh pr checkout <n>`.
2. CI green? (`contract`, `lint_*`, `test_*`, `e2e_mock`, `guards`, `ownership_check`, `docker_build`.) Red → send the failing job back to the lane's agent; don't review yet.
3. Ask me: "review PR #N against its lane plan" — I run the code-review skill with the lane plan, spec, `docs/conventions/` and `docs/design/brand.md` as the rubric, and check: only `Owns` files touched; tests are real (fail-first, no snapshot-only); privacy rules (no raw answers, no PII in logs/prompts); tenancy (agency/coordinator 404s); both-viewport screenshots vs the handoff image; no raw hex; no storage of secrets; contract conformance; real-data/golden output pasted when the lane has it.
4. Merge (squash). `main` stays green because branch protection requires the same checks.
5. **CCR PRs** (label `ccr`, `contracts/**` + generated types + matching mock/hook change) are reviewed first and merged immediately; every open lane then rebases (`git fetch && git rebase origin/main`).
6. After merge: `bin/lane stop <LANE>` to free the worktree's Docker stack.

Rule of thumb: **one reviewer-hour per ~4 concurrent lanes**. If PRs pile up, don't start the next batch.

## 7. Keeping it orderly

- **Tracking:** `bin/lane status` (from GitHub) is the source of truth; every lane has exactly one branch `lane/<ID>-<slug>` and one PR. No shared status file to conflict on.
- **History:** one commit per plan task (`feat(<lane>): task N – …`); PRs are squash-merged, so `main` has one commit per lane.
- **Specs/plans travel with code**: plans' checkboxes may be ticked in the lane's PR (allowed outside `Owns`); don't edit other plans.
- **Conflicts:** `routes`, nav, isolation, rack_attack are per-lane files, so conflicts should not occur; if one does, it's a lane-definition bug — stop and report it.
- **Never**: two agents in one worktree; `docker compose down -v` outside your own worktree; running `fly`/`gh repo …` admin commands from an agent; committing exports/`.env`/keys (`bin/guard-no-health-data` and CI will fail it); pasting real rows into prompts, issues or PRs.

## 8. Cost and attention controls

- Tier models: top for W0-1/W0-3/W0-5, B-INGEST, B-AGENT, W3-1; mid for most; cheap for the four small UI lanes. Don't pay top-tier prices for the mock handlers or kit components.
- Cap concurrency by review capacity, not by machine capacity (§6 rule of thumb).
- Give agents the "stop and ask" rule explicitly (it is in every prompt) — a stalled agent costs less than a wrong one.
- Watch token-heavy loops: failing `make verify` repeated > 3 times → stop the agent and look at the failure yourself.
- Real-data runs (Lakeside is 69 MB) happen locally, once per lane that has `:real_data` specs, not in loops.

## 9. Troubleshooting

| Symptom | Fix |
|---|---|
| `bin/lane start` says no `.env` in the main checkout | `cp .env.example .env` in the main checkout and set `ANTHROPIC_API_KEY` |
| `make up` refuses in a worktree | run `make worktree-env` (or `bin/lane start` did it) |
| Port already in use | worktrees use Docker-assigned ports; `make ports` shows them; never hardcode 3000/5173 |
| `bin/lane check` flags a file you must change | it's outside your lane: CCR or ownership issue, not a workaround |
| Mock and backend disagree | the contract (`contracts/openapi`) is the arbiter; CCR if the contract is wrong |
| Real-data spec skipped | exports missing locally (`ls handoff/takehome/exports`); they are never in CI |
| Lakeside import slow/OOM | check `docker stats`; the job runs on the single `ingest` thread; Docker needs ≥ 4 GB for the api container |
| Agent keeps re-planning | point it at the plan's "detail reference" task and the overrides; plans win over its own ideas |
| Many PRs red after a `ccr` merge | everyone `git fetch && git rebase origin/main`; regenerate types (`make types`) if they conflict — never hand-merge `schema.d.ts` |

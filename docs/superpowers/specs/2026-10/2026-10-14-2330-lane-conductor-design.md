# Lane conductor: Claude Code drives many OpenCode lanes, batch-approved — Design

**Status:** Draft for review · **Depends on:** [`2100 parallel build architecture`](./2026-10-14-2100-parallel-build-architecture-design.md), [`../../parallel/review-gate.md`](../../parallel/review-gate.md), [`../../parallel/dependencies.md`](../../parallel/dependencies.md), the CI pipeline from [`2200`](./2026-10-14-2200-ci-cd-pipeline-design.md) (W0-7) · **Plans:** to be written after review

## Goal
Let one Claude Code session run the 32 lanes through OpenCode **in parallel**: start every lane whose prerequisites are merged, verify and review each finished lane independently, publish reviewed lanes after **one human "go" per batch**, wait for the pipelines, feed failures back to the same OpenCode session, and start the next ready lanes as merges land.

## Findings
1. **The pieces exist but nothing connects them.** `bin/lane` has `start`, `run` (headless OpenCode, `--session`, `--timeout`, main-checkout tripwire), `review` (mechanical report), `approve` (bound to the exact HEAD), `pr` (push, PR, `claude-review` status, optional auto-merge) and `status`. `bin/lane graph` already derives each lane's direct prerequisites from the plans' `Depends on` lines (`direct_deps`).
2. **Nothing computes what may start next.** `dependencies.md` states the earliest-start table, but only as prose and a generated diagram; no command returns "ready lanes now".
3. **Nothing watches CI or feeds a failure back.** `bin/lane pr` ends at enabling auto-merge; a red check, a rebase after a `ccr` merge, or a merged lane that unblocks others is handled by hand.
4. **No cross-step state.** The only per-lane records are `.superpowers/gate/<LANE>/` (review report, approval, event logs). The OpenCode session id, attempt counts and phase are not stored, so a `/clear` loses the run.
5. **The review gate asks for a human push approval per lane** (G4) and a human merge (G5), which does not scale to the 5-backend + 13-frontend fan-out in Wave 1.
6. **The review step is the bottleneck.** The playbook sets the budget at about one reviewer-hour per 4 concurrent lanes; running G3 serially in one context would cap throughput.
7. **A CI-fix commit already invalidates the published approval.** `bin/lane pr` posts `claude-review=success` on the reviewed commit, so a new head has no such status and branch protection blocks the merge until it is re-posted.
8. **`.github/workflows` is empty on this branch** (W0-7 not merged): there is no pipeline to wait on until W0-7 lands, and `bin/lane pr` auto-merge and the `claude-review` required check depend on `bin/setup-github --apply` having run.

## Decisions
1. **The conductor is this Claude Code session.** No daemon. Each OpenCode run and each CI watch is a background Bash job (`run_in_background`), so the session is notified on exit and never polls. Resuming after `/clear` rebuilds from the state file plus `bin/lane status`.
2. **State file:** `.superpowers/orchestrator/state.json` in the main checkout (git-ignored, like `.superpowers/gate/`). One record per lane: `phase`, `session` (OpenCode session id), `model`, `fix_rounds` (G2/G3), `ci_rounds`, `pr`, `head` (last reviewed commit), `blocked_reason`. GitHub is the source of truth for PR and merge state; the file is the source for everything else.
3. **Lane phases:** `queued → running → verifying → fixing → ready → approved → pr_open → ci → merged`, plus `blocked`. `ready` means G2 and G3 passed and the lane waits for the next batch report.
4. **Scheduler:** a lane is *ready to start* when every direct prerequisite is `merged` (from `bin/lane status`), the lane has no worktree or branch yet, and no `ccr` PR is open. Caps, all overridable per session:
   - `max_running` = 4 concurrent OpenCode runs;
   - `max_backend_stacks` = 5 lanes with a Docker stack (frontend lanes run on Node only);
   - `max_waiting` = 4 lanes in `ready`/`fixing`/`pr_open`/`ci` combined; at the cap, no new lane starts (the review budget from the playbook).
5. **Dispatch:** `bin/lane start <LANE>` then `bin/lane run <LANE> --model <tier model>` as a background job. Model tier per lane follows the playbook table (top / mid / cheap).
6. **Verification (G2, mine, never the agent's claim):** on a run's exit I run `bin/lane review`, re-run the plan's "Done when" commands and `make verify` in the worktree, and compare with the agent's summary. `FAIL` or an unreproducible claim goes back to the same session (`bin/lane run <LANE> --session <id>`) with the exact failing output.
7. **Judgement review (G3):** one forked subagent per finished lane, in parallel, each reading only its own worktree diff against the lane plan, its spec, `docs/conventions/` and `docs/design/brand.md` (the G3 rubric in `review-gate.md`). Findings go back to the lane's OpenCode session. At most **2 fix rounds**; a third failure sets `blocked` and I report why.
8. **Approval is per batch.** When one or more lanes are `ready`, I present **one report**: per lane the verdict, the commands I ran with real output, deviations, risks, screenshots (UI lanes), and what the lane unblocks. You answer `go`, `go except <LANE>`, or `change <LANE>: …`. On `go` I run `bin/lane approve <LANE> --by <you>` then `bin/lane pr` for each approved lane (head-bound, unchanged). A new batch report is produced only when a lane is `ready`; I do not interrupt you for anything else except stops (Decision 11).
9. **Merge on green:** `bin/lane pr` enables squash auto-merge, so a lane merges when the required checks, including `claude-review`, are green. This amends G5: for batch-approved lanes the merge is automatic, your "go" is the authorization. The pilot (W0-1) stays a batch of one and keeps G5 manual (`--no-auto-merge`).
10. **After approval, red CI or a needed rebase:**
    - `bin/lane ci <LANE>` fetches the failing job logs; I send them to the lane's session (`ci_rounds` ≤ 2).
    - The fix or a rebase produces a new head with no `claude-review` status, which blocks the merge. I re-run G2, review only the delta (`git range-diff` for a clean rebase), and re-post the status. **Your batch "go" covers these post-approval commits only if** the delta touches only files in the lane's `Owns` list and passes G2 and the delta review; anything else becomes a new item in the next batch report. The batch report lists post-approval fixes after the fact.
    - A merged `ccr` PR makes me run `bin/lane rebase <LANE>` for every open lane before anything else is dispatched.
11. **I stop and tell you** when: any `review-gate.md §6` tripwire fires; a lane reaches a third failed round; a plan defect is found; a CI failure is not caused by the lane (main red, infrastructure); `make verify` is green locally but red in CI twice; or anything touches the real exports or secrets.
12. **After merge:** `bin/lane stop <LANE>` (tears down its Docker stack), recompute the ready set, dispatch the next lanes within the caps.
13. **Tooling to add (one small tooling PR, outside every lane's `Owns`):**
    - `bin/lane next [--json] [--assume-merged IDS] [--limit N]` prints lanes ready to start;
    - `bin/lane ci LANE [--dry-run]` waits for the PR checks and prints failing job logs;
    - `bin/lane rebase LANE` rebases the worktree on `origin/main` and prints a `range-diff`;
    - `bin/lane state show|set` reads and updates the state file.
14. **`review-gate.md` is amended** (G4 per batch, G5 automatic for batch-approved lanes, the trust-ladder level 1 wording). Trust ladder rules are unchanged: any hard stop, post-merge regression or canary failure drops a level.

15. **Worktrees are the unit of isolation.** One lane = one worktree `.worktrees/<lane-id>` = one branch `lane/<LANE>-<slug>` = one OpenCode session.
    - `bin/lane start` creates it from `origin/main` with its own Docker stack; `bin/lane run` executes OpenCode with that worktree as its working directory and fails if the main checkout changes.
    - Every conductor action on a lane happens inside that lane's worktree: G2 re-runs, the G3 subagent (given the worktree path, read-only), fix rounds (`--session`, same worktree), `bin/lane ci`, `bin/lane rebase`, `bin/lane approve`/`pr`.
    - The conductor itself works from the main checkout or any other worktree; `bin/lane` resolves the main checkout from the git common dir, so the state file and `.superpowers/gate/` are always shared, never per worktree.
    - Two agents never share a worktree; the conductor never edits lane files, it only sends findings to the lane's session. Conductor-owned changes (this tooling, docs) get their own worktree and PR.
    - `bin/lane stop` removes the worktree and its Docker stack only after the lane is `merged`.

## Non-goals
A background daemon or GitHub-Actions-driven dispatch; changing lane plans, `Owns` lists or the OpenCode permission set; merging without green required checks; skipping independent verification; running real-data specs in CI; any change to the pilot rule that W0-1 goes first and alone.

## Open assumptions (checked in the plan, not decided here)
- The uncommitted `bin/lane` changes (auto-merge, `claude-review` status) and `bin/setup-github` are merged before this tooling is built, and `bin/setup-github --apply` has made `claude-review` a required check.
- W0-7 has merged, so CI exists. Until then the conductor can run Decisions 1–7 and stop at `ready`.

## Acceptance criteria
1. `bin/lane next --json --assume-merged W0-1 | python3 -c 'import json,sys; ids=set(json.load(sys.stdin)); sys.exit(0 if ids=={"W0-2","W0-3","W0-4A","W0-7"} else 1)'` exits 0 (the earliest-start table in `dependencies.md`).
2. `bin/lane next --json --assume-merged W0-1,W0-3 | python3 -c 'import json,sys; ids=set(json.load(sys.stdin)); want={"B-INGEST","B-METRICS","B-LEADS","B-ACTIONS","B-ACCOUNT"}; sys.exit(0 if want<=ids else 1)'` exits 0.
3. `bin/lane next --json --assume-merged W0-1,W0-3 --limit 2 | python3 -c 'import json,sys; sys.exit(0 if len(json.load(sys.stdin))==2 else 1)'` exits 0.
4. `bin/lane next --json --assume-merged W0-1 | python3 -c 'import json,sys; sys.exit(1 if "B-AGENT" in json.load(sys.stdin) else 0)'` exits 0 (nothing starts before its prerequisites).
5. `bin/lane ci F-WEEK --dry-run` exits 0 and prints the `gh pr checks` command it would run.
6. `bin/lane state set F-WEEK phase=running session=abc && bin/lane state show F-WEEK | grep -q '"session": "abc"'` exits 0.
7. `bin/lane rebase --help` exits 0.
8. `grep -q 'per batch' docs/superpowers/parallel/review-gate.md && grep -q 'bin/lane next' docs/superpowers/parallel/playbook.md` exits 0.
9. `bin/lane graph --file docs/superpowers/parallel/dependencies.md --check` exits 0 (the scheduler reads the same graph and the generated doc is still current).

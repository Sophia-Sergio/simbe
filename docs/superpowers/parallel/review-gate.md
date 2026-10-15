# Review gate: handing lanes to OpenCode while you stay in control

Goal: nothing built by an agent reaches GitHub, or gets built on by the next lane, until **you have seen independent evidence that it is right**. Claude Code (the orchestrator) hands one lane to OpenCode, **verifies the result itself instead of trusting the agent's report**, reviews it against the plan and conventions, and only then asks you for a go. Related: [`playbook.md`](./playbook.md) (who does what), [`dependencies.md`](./dependencies.md) (what can start when).

## 1. Principles

1. **Evidence over claims.** An agent saying "tests pass" counts for nothing; I re-run the plan's commands and read the output.
2. **Agents cannot publish.** OpenCode runs with a locked-down permission set: no `git push`, no `gh`, no remotes, no `fly`, no writes outside its worktree. It can only commit locally. Pushing and opening PRs is done by `bin/lane pr`, which refuses without a recorded human approval for the **exact commit**.
3. **One step at a time, widening only when earned** (trust ladder, §5).
4. **You decide what ships.** I never merge; I never push without your explicit "go" for that lane.
5. **Everything is auditable**: event logs, review reports and approvals live in `.superpowers/gate/<LANE>/` (git-ignored, local).

## 2. The gates

| Gate | Who | What happens | Command / artifact |
|---|---|---|---|
| **G0 Ready** | Claude Code | Lane's `Depends on` are merged to `main` (see `dependencies.md`); `main` is green; worktree created with its own Docker stack | `bin/lane start <LANE>` |
| **G1 Handoff** | Claude Code → OpenCode | Lane plan handed to OpenCode in the worktree, headless, under the locked-down config, with a timeout. It must commit after every task and finish with an honest summary | `bin/lane run <LANE> --model <provider/model>` → `opencode.<ts>.jsonl` |
| **G2 Independent verification** | Claude Code | Mechanical report (clean tree, ownership, one commit per task, secrets/skips/TODO/debug flags, new dependencies) **plus I re-run the plan's "Done when" commands and `make verify` myself** and compare with the agent's claims | `bin/lane review <LANE>` → `review.md`; command outputs pasted in my report |
| **G3 Code review** | Claude Code | Judgement review of the diff against the lane plan, its spec, `docs/conventions/`, `docs/design/brand.md`: test quality (fail-first, no snapshot-only), tenancy/privacy, contract conformance, both-viewport screenshots vs the handoff image, no speculative abstractions. Findings go back to OpenCode (same session, `--session`) for at most **2 fix rounds**; then I fix or escalate | review findings list; re-run G2 after every round |
| **G4 Your approval** | **You** | I show you: verdict, evidence, deviations, risks, screenshots, what the lane unblocks. You say "go" or "change X". Only then: `bin/lane approve <LANE> --by <you>` and `bin/lane pr` | `approved.json` (bound to the exact HEAD) |
| **G5 Merge** | **You** | You merge the PR. The next lane starts only after the merge and a fresh G0 | GitHub |

If a lane fails G2/G3 twice, I stop and tell you why instead of continuing.

## 3. What OpenCode can and cannot do (verified)

`bin/lane run` writes this permission set to a per-lane config and points OpenCode at it with `OPENCODE_CONFIG` (a headless run cannot answer "ask" prompts, so everything not explicitly allowed is **denied**):

- **Allowed:** edit files in its worktree; `make`, `bin/rails`, `bundle`, `docker compose` (its own project), `npm`/`npx`/`node`/`python3`, `bin/lane check`, local `curl` to `localhost`/`127.0.0.1`, and `git add|commit|status|diff|log|show|mv|rm`.
- **Denied:** `git push`, `git remote`, `git config`, `git reset --hard`, `git checkout -- …`, `gh`, `fly`/`flyctl`, `sudo`, `rm -rf`, `docker system prune`, `docker volume rm`, `docker compose down -v`, any path outside the worktree (`external_directory: deny`), and every shell command not listed above.

**Canary** (`bin/lane canary --model <m>`): a throwaway repo with a local bare remote and a prompt that tries, in order, a legitimate edit+commit, `git push`, `gh pr list`, `rm -rf`, creating a file outside the worktree, and `git remote add`. Result with `opencode-go/claude-haiku-5-5`: **allowed steps succeeded; push, `gh`, `rm -rf`, the outside write and `git remote add` were all blocked** (6/6 checks). Re-run the canary after any OpenCode upgrade or config change; it takes ~30 seconds. Note: OpenCode has no default model configured on this machine, so `run`/`canary` require `--model` (or `LANE_MODEL`).

## 4. Two kinds of review (both required)

**Mechanical (`bin/lane review`, no judgement):** working tree clean; changed files ⊆ the plan's `Owns`; at least one commit per plan task; sensitive-data guard; added-line scan for secrets, skipped/focused tests, TODO/FIXME, debug leftovers, browser storage, `dangerouslySetInnerHTML`, native dialogs, raw hex colors, stray `fetch(`; new gems/npm packages listed for justification; plan checkboxes ticked. Verdict: **FAIL** (hard stop: dirty tree, files outside the lane, secret, skipped test) / **REVIEW** (warnings a person must judge) / **PASS**.

**Judgement (G3, me):** does it implement the plan's *intent* and the spec's decisions, not just the letter? Are tests testing behavior (written to fail first), with the plan's exact expected numbers (Alpha / golden oracle)? Tenancy: other agency/coordinator → 404. Privacy: no raw screener answers outside the assigned coordinator, no PII in logs. Contract: responses match `contracts/openapi`. UI: both viewports, brand tokens only, no layout overflow. Simplicity: no features beyond the plan.

## 5. Trust ladder

| Level | Rule | Move up when |
|---|---|---|
| **0 – Pilot** | One lane at a time, starting with **W0-1** (the scaffold everything depends on). I show you the full G2 evidence and G3 findings; you approve each push | The first 2 lanes passed with ≤ 1 fix round and no hard stops, and the canary still passes |
| **1 – Small batch** | Up to 3 independent lanes in parallel (different packs/features); one combined report, **one approval per lane** | 5 more lanes merged with no post-merge regressions on `main` |
| **2 – Wave batch** | A whole wave (e.g. the 5 backend lanes) in parallel; I review each, you approve per wave with per-lane evidence available | Wave 1 merged green; W3-1 integration passes |

Any hard stop, post-merge regression or canary failure drops us one level.

## 6. Tripwires (I stop and tell you)

A push/remote/`gh` attempt in the event log · files outside `Owns` · a decrease in test count or any newly skipped test · a plan deviation with no explanation · a new dependency that isn't in the plan · an agent claim that doesn't reproduce when I re-run it · more than 2 fix rounds · the canary failing · anything touching the real exports or secrets.

## 7. The pilot, concretely (W0-1)

```bash
bin/lane start W0-1 --slug scaffold                       # G0: worktree + isolated docker env
bin/lane run  W0-1 --model <provider/model> --timeout 120   # G1: headless OpenCode, local commits only
bin/lane review W0-1                                      # G2 (mechanical) — then I re-run the plan's Done-when commands myself
# G3: I review the diff against the plan + spec, send findings back (bin/lane run W0-1 --session <id> …), re-verify
# G4: I report to you with evidence; you reply "go" (or "change X")
bin/lane approve W0-1 --by <you> && bin/lane pr           # push + PR, bound to the reviewed commit
# G5: you merge; only then does W0-2/W0-3/W0-4A/W0-7 start
```
What you will see at G4: the verdict line, the commit list (one per plan task), the commands I ran with their real output, the deviations/rulings, risks, and for UI lanes both screenshots.

## 8. FAQ

- **What if OpenCode stalls or loops?** `--timeout` kills it; the partial commits stay local; I review what exists and either continue the session or take the lane over myself.
- **Which model?** Your call (`opencode models`); use a strong coding model for W0-1/W0-3/W0-5/B-INGEST/B-AGENT and cheaper ones for small UI lanes. The gate is model-independent: the review decides, not the model's confidence.
- **Does this slow things down?** The first lanes yes (that is the point); the ladder removes manual steps as trust is earned, but never the independent verification or your approval of what gets pushed.
- **What can still go wrong?** Plans themselves are untested until a lane runs them; the first lane may expose plan defects. Those are fixed in the plan (separate docs PR), not worked around.

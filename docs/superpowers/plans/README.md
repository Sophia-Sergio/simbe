# Implementation plans

Written by **Claude Code** (superpowers `writing-plans`), executed task-by-task by **Cursor / OpenCode**. Name: `YYYY-MM/YYYY-MM-DD-HHmm-<feature>.md`.

## Template

```markdown
# [Feature] Implementation Plan

> **For Cursor / OpenCode:** Implement task-by-task. Follow `docs/conventions/` and `docs/design/brand.md`. Stop if blocked — do not replan silently. **Commit after every task.**

**Goal:** one sentence
**Spec:** `docs/superpowers/specs/YYYY-MM/…-design.md`
**Depends on:** plans that must be merged first · **Unblocks:** …
**Architecture:** 2–3 sentences · **Tech Stack:** …

## Global Constraints   (verbatim rules every task inherits)
## Review Focus         (inputs most likely to bite; each has a test in its owning task)
## File Map             (Action | Path)
## Task N: Title
**Files:** …  **Interfaces — Consumes/Produces:** exact names and signatures
- [ ] Step 1: failing test (real code)   - [ ] Step 2: run, expect FAIL
- [ ] Step 3: minimal implementation     - [ ] Step 4: run, expect PASS   - [ ] Commit
```

## Rules for plan authors

- Verification commands run through Docker/`make` (`docker compose exec web bundle exec …`, `make spec ARGS=…`).
- One owner spec per HTTP path; no service spec for a happy path a request spec already covers.
- Every task ends with a verifiable step and a commit; the last task runs `make verify`.
- New routes are added to `ISOLATION_ROUTES` in the same task.
- A plan names the interfaces it consumes/produces so a task can be implemented without reading its neighbors.
- No placeholders ("TBD", "add validation", "similar to task N").

Index and build order: [`../README.md`](../README.md).

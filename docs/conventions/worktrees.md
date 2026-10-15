# Worktrees and isolated Docker stacks

Every lane runs in its **own git worktree** with its **own Docker Compose stack**, so many agents share one machine without colliding. Rules live here; the tool is `bin/lane` ([`docs/superpowers/parallel/README.md`](../superpowers/parallel/README.md), [`playbook.md`](../superpowers/parallel/playbook.md)).

## One lane = one worktree = one agent

```bash
bin/lane list                 # lanes, waves and their plans
bin/lane start F-WEEK         # git worktree add .worktrees/f-week -b lane/F-WEEK-… origin/main
                              # + bin/worktree-env (isolates this stack) + prints the agent prompt
cd .worktrees/f-week          # open THIS folder in Cursor / run `opencode` / `claude` here
# … implement the plan task-by-task, commit after each task …
bin/lane check                # only files in the plan's Owns list changed
bin/lane pr                   # push, open the PR with the lane checklist
bin/lane stop F-WEEK          # after merge: tear down this stack and remove the worktree
```

- **Never two agents in one worktree.** One worktree, one branch (`lane/<ID>-<slug>`), one PR.
- **Specs and plans travel with the branch** — they are committed, so a worktree has them.

## Stack isolation

`bin/worktree-env` (run for you by `bin/lane start`, or `make worktree-env`) writes this worktree's `.env`:

- `COMPOSE_PROJECT_NAME=simbe-wt-<slug>` — containers, network and named volumes belong to this worktree only.
- `POSTGRES_DB=simbe_wt_<slug>` — its own database.
- `WEB_PORTS` / `VITE_PORTS` / `DB_PORTS` — **host ports assigned by Docker**, so nothing collides. Get them with `make ports`; **never hardcode 3000 / 3036 / 5434.**
- `SIMBE_EXPORTS_DIR` — points at the **main checkout's** `handoff/takehome/exports/` (the local-only real data, git-ignored, absent from linked worktrees; mounted read-only at `/exports` in the container).

`make up` runs `worktree-guard` first: in a linked worktree it refuses to start until `.env` has `COMPOSE_PROJECT_NAME` (i.e. until `bin/worktree-env` has run).

## Never

- **Touch another worktree's stack.** `docker compose …` in this worktree acts on `simbe-wt-<slug>`; running it elsewhere, or `docker compose down -v` outside your own worktree, destroys someone else's data.
- **Run `rails`/`bundle`/`npm` on the host for Rails/DB work** — use Docker (`make …`, `docker compose exec web …`). Node-only tooling (Vitest, Playwright, the mock host, `npm run contract`) runs **on the host** with Node 22.

## Where local-only data lives

The real exports are only in the **main checkout** at `handoff/takehome/exports/{harbor,lakeside}/` (git-ignored). `SIMBE_EXPORTS_DIR` is how a worktree reaches them. They never leave the machine and never enter CI ([`real-data.md`](./real-data.md)).

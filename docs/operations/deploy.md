# Deploy

**What:** one-time Fly.io setup, the first deploy, and how routine deploys work. Routine deploys are automatic: merging to `main` runs the pipeline, and the `deploy` job ships the green commit ([`docs/conventions/ci.md`](../conventions/ci.md)).

**Prerequisites:** `flyctl` installed and `fly auth login`; owner access to the GitHub repo; `gh` logged in; the owner's password manager open ([secrets.md](./secrets.md)); `bin/setup-github` present (dry run by default).

> Product names and prices change. Anything Fly-specific below is marked **unverified** — confirm against the current Fly.io docs when you provision.

## First-time setup

1. **Create the app.**
   ```
   fly apps create simbe
   ```
   **Done when** `fly status --app simbe` shows the empty app (no machines yet).
2. **Provision Postgres 16.** Recommended default: Fly's managed Postgres in the same region (`ord`). **Unverified: confirm the current product name and pricing in Fly's docs** (cross-check the region and that it is Postgres 16). Attach it to the app, or create it separately and copy its connection string into `DATABASE_URL`.
   ```
   # e.g. (confirm the current command in Fly's docs)
   fly postgres create --name simbe-db --region ord
   fly postgres attach simbe-db --app simbe     # sets DATABASE_URL
   ```
   **Done when** `fly secrets list --app simbe` includes `DATABASE_URL` and the database is in region `ord`.
3. **Set the secrets** ([secrets.md](./secrets.md)). **Done when** `fly secrets list` shows all six names and the AR keys are in the password manager.
4. **Back up the AR encryption keys.** Blocking: do not continue until the three `AR_ENCRYPTION_*` values are saved in the password manager. Losing them makes stored screener answers unreadable.
5. **First deploy:**
   ```
   fly deploy --remote-only --ha=false --app simbe
   ```
   `--ha=false` keeps a single machine because imports run as background jobs in the Puma process (`SOLID_QUEUE_IN_PUMA=true`) and the app **must not scale to zero** (`fly.toml`: `auto_stop_machines = 'off'`, `min_machines_running = 1`). The `release_command` runs `bundle exec rails db:prepare` before the new release goes live.
   - **Done when** `fly status --app simbe` shows the machine healthy and `curl -fs https://simbe.fly.dev/up` returns 200.
   - Verify the image serves all three: `curl -fsS https://simbe.fly.dev/ | grep -qi '<div id="root">'` (SPA shell) and `curl -s -o /dev/null -w '%{http_code}\n' https://simbe.fly.dev/api/v1/me` prints `401`.
6. **GitHub `production` environment + `bin/setup-github`.** Add the `FLY_API_TOKEN` secret to the environment `production` and (recommended) a required reviewer, because deploys touch health data. Then, from the repo root:
   ```
   bin/setup-github              # dry run: prints labels + branch-protection payload, changes nothing
   bin/setup-github --apply      # owner runs this; applies labels, merge settings, branch protection
   ```
   Run `--apply` only after the CI pipeline has run once on `main`, or the required checks cannot exist yet (see the `--stage` note in the script).
   **Done when** the dry run prints the labels and payload and makes no API calls, `--apply` succeeds, and `main` requires the CI checks.
7. **First sign-up and first data load.** In the browser, sign up an owner on `https://simbe.fly.dev` and load a sample export through the wizard (step 4) or **Data sources**. Use `bin/generate-sample-export` (synthetic), **not** the real exports, unless the owner decides otherwise.
   **Done when** the upload progresses to completion ("Your data is loaded") and the dashboard shows non-zero numbers.

## Routine deploys

- **Merge to `main`.** The pipeline runs every required job; when they pass, the `deploy` job deploys with `--remote-only --depot --ha=false` and then health-checks `/up`, `/` (SPA shell) and `/api/v1/me` → 401. No human step.
- Watch it: `fly logs --app simbe`, or the post-deploy step in the GitHub `deploy` job.
- A failed deploy does **not** replace the running release; fix forward or roll back ([rollback.md](./rollback.md)).

## Verify (after any deploy)

- `curl -fs https://simbe.fly.dev/up` → 200.
- `curl -fsS https://simbe.fly.dev/ | grep -qi '<div id="root">'` → SPA shell served.
- `curl -s -o /dev/null -w '%{http_code}\n' https://simbe.fly.dev/api/v1/me` → 401.
- `fly status --app simbe` → one healthy machine, `min_machines_running = 1` (never scaled to zero).

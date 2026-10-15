# Rollback

**What:** get production back to the previous working release after a bad deploy. Fly keeps the last releases and their images; rolling back is redeploying an earlier image.

**Prerequisites:** `flyctl` (owner), access to the app.

## Steps

1. **See the releases** (newest first, with image refs and status):
   ```
   fly releases --app simbe
   ```
2. **Redeploy the previous good image:**
   ```
   fly deploy --image <previous-image-ref> --app simbe --ha=false
   ```
   Use the image ref of the release *before* the bad one (skip anything marked failed).
   **Done when** `fly status --app simbe` shows the machine healthy on the older release.
3. **Verify** (same checks as a normal deploy):
   ```
   curl -fs https://simbe.fly.dev/up                                              # 200
   curl -fsS https://simbe.fly.dev/ | grep -qi '<div id="root">'                  # SPA shell
   curl -s -o /dev/null -w '%{http_code}\n' https://simbe.fly.dev/api/v1/me       # 401
   ```
4. **Fix forward.** Open a PR with the fix; merging to `main` redeploys ([deploy.md](./deploy.md)).

## Migrations

- **Never edit an applied migration.** A bad migration is fixed **forward** with a new migration; rolling the image back does not un-run a migration.
- If a bad migration already ran and broke reads, restore from a backup into a scratch database, verify, and plan the corrective migration ([backups.md](./backups.md)). If the schema change is destructive, treat it as an incident: stop writes, restore, then fix forward.

## Done when

- The running release is the previous good one and all three health checks pass.
- `fly releases --app simbe` shows the bad release superseded by a newer, healthy release.

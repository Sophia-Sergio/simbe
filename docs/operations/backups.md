# Backups

**What:** database backups and the restore drill, including the check that encrypted screener answers still decrypt. Screener answers are health data and are encrypted with `AR_ENCRYPTION_*`; a backup is only useful together with those keys.

**Prerequisites:** the managed Postgres provider's console/CLI (Fly managed Postgres or the external provider); a scratch database to restore into; `AR_ENCRYPTION_*` keys from the password manager ([secrets.md](./secrets.md)).

## Daily backups

1. **Enable daily backups** at the provider (Fly managed Postgres provides automated daily snapshots; **unverified: confirm the current product name, schedule and retention in Fly's docs**, or use an external provider's equivalent).
   **Done when** the provider's console lists a completed backup from the last 24 hours.
2. **Set retention** to at least **30 days** (adjust with counsel/provider limits; health-like data). **Done when** the retention setting is visible in the console.

## Restore drill (quarterly, and after any schema/key change)

1. **Restore a backup into a scratch database** (never over the production database):
   ```
   # provider-specific: create/restore into e.g. simbe-restore-drill
   ```
   **Done when** the scratch database connects.
2. **Point the app at it and count rows:**
   ```
   DATABASE_URL=<scratch-url> bin/rails runner 'puts Lead.unscoped.count'
   ```
   **Done when** the count is non-zero and matches production's order of magnitude.
3. **Verify encrypted columns decrypt with the stored keys.** Do not put the keys on a command line (shell history, process lists). Put the scratch `DATABASE_URL` and the three `AR_ENCRYPTION_*` values in a throwaway env file (`chmod 600`, outside the repo), run the runner with it, and delete the file afterwards:
   ```
   umask 077; $EDITOR /tmp/restore-drill.env      # DATABASE_URL=..., AR_ENCRYPTION_*=...
   set -a; . /tmp/restore-drill.env; set +a
   bin/rails runner 'puts ScreenerAnswer.where.not(answer: nil).limit(1).pick(:answer)&.length'
   shred -u /tmp/restore-drill.env 2>/dev/null || rm -P /tmp/restore-drill.env
   ```
   (Or run the runner with `fly ssh console` against the scratch app, which already has the keys as secrets.)
   **Done when** the answer decrypts (prints a length) with **no** `ActiveRecord::Encryption::Errors` and fails cleanly if the keys are wrong.
4. **Record the drill**: date, backup used, row counts, decryption result. Add it to the ops log.

## Rules

- The three `AR_ENCRYPTION_*` keys are part of the backup: a backup without them cannot read screener answers. Keep them in the password manager ([secrets.md](./secrets.md)).
- Run drills on scratch data only; never paste real rows anywhere ([`docs/conventions/real-data.md`](../conventions/real-data.md)).
- Prefer restoring into a scratch database; restoring over production is an incident decision, not a drill.

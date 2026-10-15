# Secrets

**What:** every secret Simbe needs in production, how to generate each, where it lives, and how to rotate it. Secrets are stored only in the Fly secret store (runtime) and the GitHub **environment `production`** secret store (the deploy token). Never in the repo, never in `fly.toml`, never in a `.env` that is committed.

**Prerequisites:** `flyctl` installed and `fly auth login`; the app exists ([deploy.md](./deploy.md)); the owner's password manager is open.

## The secrets

| Secret | What it is | How to generate |
|---|---|---|
| `SECRET_KEY_BASE` | Rails cookie/session signing key. | `openssl rand -hex 64` |
| `DATABASE_URL` | Postgres 16 connection string (`postgres://user:pass@host:5432/db`). | From the database provider ([deploy.md](./deploy.md)). |
| `AR_ENCRYPTION_PRIMARY_KEY` | Active Record Encryption primary key. | `bin/rails db:encryption:init` (run in the app container/checkout). |
| `AR_ENCRYPTION_DETERMINISTIC_KEY` | AR Encryption deterministic key (needed for encrypted lookups). | `bin/rails db:encryption:init` |
| `AR_ENCRYPTION_KEY_DERIVATION_SALT` | AR Encryption key-derivation salt. | `bin/rails db:encryption:init` |
| `ANTHROPIC_API_KEY` | The "Ask Simbe" agent. | Reuse the sibling project's key (`../personal/appketing/.env`). |

> **The three `AR_ENCRYPTION_*` values are health-data keys.** `screener_answers.answer` is encrypted with Active Record Encryption. **Losing them makes every stored screener answer permanently unreadable**, and there is no recovery beyond a database backup that decrypts with the same keys. Back them up **before the first deploy** and on every rotation.

## Steps

1. **Generate the values.**
   ```
   openssl rand -hex 64          # SECRET_KEY_BASE
   bin/rails db:encryption:init  # the three AR_ENCRYPTION_* values
   ```
   (Run `db:encryption:init` where the app can boot — the Docker `web` container is fine: `docker compose exec web bin/rails db:encryption:init`.)
2. **Record them in the owner's password manager** *before* setting them on Fly. One entry, all secrets, plus the date. **Never** re-generate AR keys for a database that already holds encrypted rows.
3. **Set them on Fly:**
   ```
   fly secrets set \
     SECRET_KEY_BASE=... \
     DATABASE_URL=... \
     AR_ENCRYPTION_PRIMARY_KEY=... \
     AR_ENCRYPTION_DETERMINISTIC_KEY=... \
     AR_ENCRYPTION_KEY_DERIVATION_SALT=... \
     ANTHROPIC_API_KEY=... \
     --app simbe
   ```
   Setting secrets triggers a restart/rolling deploy. **Done when** `fly secrets list --app simbe` shows all six names (values are never displayed) and the app comes back healthy (`fly status --app simbe` shows the machine passing its `/up` check).
4. **Add the deploy token to GitHub** (one-time): create a Fly deploy token scoped to the app (`fly tokens create deploy --app simbe`), then add it as `FLY_API_TOKEN` in the GitHub **environment `production`** (`Settings → Environments → production → Add secret`), not as a repository secret. Optionally add a required reviewer on that environment — recommended, because the environment gates access to health data.
   - **Done when** the GitHub `deploy` job can read `FLY_API_TOKEN` (it stays masked in logs) and the environment exists ([deploy.md](./deploy.md) step 6).

## Rotation

- **`ANTHROPIC_API_KEY`** — rotate freely: set the new value with `fly secrets set ANTHROPIC_API_KEY=...`, revoke the old key at the provider. No data impact.
- **`SECRET_KEY_BASE`** — rotating invalidates existing cookie sessions (users sign in again). Acceptable; do it deliberately.
- **`AR_ENCRYPTION_*`** — **never replace in place.** Active Record Encryption supports key rotation through a `previous` list: set the new key(s) and keep the old ones in `..._PREVIOUS`, rewrite/verify the data, then remove the previous keys in a later change. Follow the Rails encryption-rotation guide; back up the new values in the password manager in the same change. **Done when** a screener answer written before the rotation still decrypts and a newly written one reads back.
- **`DATABASE_URL`** — rotate at the provider, update the Fly secret, redeploy. **Done when** `/up` is 200 and a read from a real table succeeds (`fly ssh console --app simbe -C "bin/rails runner 'puts Snapshot.count'"`).

## Verify

- `fly secrets list --app simbe` lists exactly the six secrets above (no more, no fewer).
- The password manager holds the three AR keys (and their generation date).
- `git grep -nE 'AR_ENCRYPTION_PRIMARY_KEY=.{8}'` finds nothing in the repo (only `.env.example` placeholders) — `bin/guard-no-health-data` and the CI `guards` job enforce this.

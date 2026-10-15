# Development environment

Everything runs in Docker Compose. Never run `rails`, `bundle`, `npm` directly on the host.

Services (`docker-compose.yml` at repo root): `api` (Rails, :3000), `web` (Vite, :5173), `db` (Postgres 16, host port 5434).

```bash
make up                 # docker compose up -d
make setup              # db:create db:migrate db:seed (first run)
make spec ARGS=spec/requests/x_spec.rb   # backend specs against simbe_test DB
make web-test ARGS=...  # vitest
make e2e                # playwright
make verify             # lint + all tests + brakeman + bundler-audit + npm audit
docker compose exec api bundle exec rails console
```

Env: copy `.env.example` to `.env` (git-ignored). `ANTHROPIC_API_KEY` is reused from the sibling project `../personal/appketing/.env` — copy the value, never commit it.
**Exception for frontend lanes** (mock mode needs no backend): with Node 22 installed, a frontend-only lane may run `npm ci`, `npm run dev`, `npx vitest`, `npx playwright test`, `npm run typecheck` and `npm run lint` **directly in `frontend/`** with `VITE_API_MODE=mock` — no Docker stack at all (this is how 13 frontend lanes run side by side on one laptop). `make verify` and anything touching Rails, Postgres or the real API still go through Docker (and each worktree gets its own stack via `bin/worktree-env`; see [worktrees.md](./worktrees.md)).

Plans must write verification steps with `docker compose exec api bundle exec …` or a `make` target.

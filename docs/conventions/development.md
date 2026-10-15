# Development environment

Rails (API + the embedded React app), the database and the Vite dev server run in Docker Compose. Never run `rails` or `bundle` on the host.

Services (`docker-compose.yml` at the repo root): `web` (Rails + Puma + Solid Queue in Puma, :3000), `vite` (`bin/vite dev`, :3036), `db` (Postgres 16, host port 5434). One `Dockerfile.dev` has Ruby **and** Node 22, so `docker compose exec web …` can run Rails, ESLint and `tsc` too. Node-only tooling (Vitest, Playwright, the standalone mock host, `npm run contract`) runs on the host with Node 22.

```bash
make up                 # docker compose up -d
make setup              # db:create db:migrate db:seed (first run)
make spec ARGS=spec/requests/x_spec.rb   # backend specs against simbe_test DB
make web-test ARGS=...  # vitest (host, Node 22)
make e2e                # playwright (host; mock projects need no Docker, real projects use E2E_BASE_URL from `make ports`)
npm run dev:mock        # standalone mock host on :5173: the React app + MSW mock API, no Rails, no Docker
make verify             # lint + all tests + brakeman + bundler-audit + npm audit
docker compose exec web bundle exec rails console
```

Env: copy `.env.example` to `.env` (git-ignored). `ANTHROPIC_API_KEY` is reused from the sibling project `../personal/appketing/.env` — copy the value, never commit it.
**Frontend-only lanes** (mock mode needs no backend) run entirely on the host with Node 22: `npm ci`, `npm run dev:mock`, `npx vitest run`, `npx playwright test` (mock projects), `npm run typecheck`, `npm run lint` — no Docker stack at all (this is how 13 frontend lanes run side by side on one laptop). `make verify` and anything touching Rails, Postgres or the real API go through Docker, and each worktree gets its own stack via `bin/worktree-env` (see [worktrees.md](./worktrees.md)).

Plans must write verification steps with `docker compose exec web bundle exec …` or a `make` target.

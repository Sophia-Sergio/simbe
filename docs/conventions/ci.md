# CI/CD

One workflow, [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml), on `pull_request`, `push: main` and a nightly schedule. It gives every lane PR fast feedback and deploys `main` to Fly.io on green. Design: [`spec 2200`](../superpowers/specs/2026-10/2026-10-14-2200-ci-cd-pipeline-design.md). Runbooks: [`docs/operations/`](../operations/README.md).

**Local = CI.** Every command a job runs is part of `make verify` (checked by `bin/ci-parity`), so passing `make verify` passes CI, except the environment-only jobs (`docker_build`, `deploy`, `e2e_real`). Budget: **≤ 12 minutes** wall-clock on a PR.

## Jobs

| Job | Guards | Required on `main` |
|---|---|---|
| `decide` | Skips re-running on `main` when the merged PR's head already passed. | — (gate) |
| `contract` | Bundles + lints the OpenAPI contract (every example validated), generated API types are up to date, no two lanes own the same file. | yes |
| `brakeman` | Rails security scan. | yes |
| `bundler_audit` | Known-vulnerable gems. | yes |
| `npm_audit` | Known-vulnerable npm packages. | yes |
| `knip` | Unused frontend code and dependencies. | yes |
| `lint_backend` | RuboCop + `boundaries:check` (pack architecture ratchet). | yes |
| `lint_frontend` | ESLint + `tsc --noEmit`. | yes |
| `test_backend` | RSpec on Postgres 16 with OpenAPI conformance on; uploads `contract-coverage.txt`. | yes |
| `test_frontend` | Vitest, incl. mock-conformance against the contract. | yes |
| `e2e_mock` | Playwright desktop + mobile against the standalone mock host; screenshots uploaded **always**. | yes |
| `e2e_real` | Full Rails + Solid Queue + the **synthetic** Harbor-shaped export; `@real` journeys skipped. | informational until W3-1 |
| `guards` | No exports/`.env`/stray CSVs tracked; `golden.json` is valid JSON; lane tooling loads; `gitleaks`. | yes |
| `ownership_check` | PRs from `lane/*` branches: changed files are inside the lane's `Owns` list. | yes (when applicable) |
| `docker_build` | The production image builds (no push). | yes |
| `deploy` | Fly deploy + post-deploy health checks (`/up`, `/`, `/api/v1/me` → 401). `main` only. | yes |

`e2e_real` runs on `main`, nightly, and PRs labelled `e2e`; it is `continue-on-error` until **W3-1** flips it to required.

## Reproduce a failing job locally

`make verify` runs the same checks (the `# parity` steps in `ci.yml`). Individual pieces:

```bash
make contract         # contract job
npm run types         # + check `git diff app/javascript/api/generated` is empty
npx knip              # knip job
make spec             # RSpec (backend tests)
make web-test         # Vitest (frontend tests)
make e2e              # Playwright mock projects (desktop + mobile, no Docker)
make ownership        # lane ownership overlap
bin/guard-no-health-data
docker compose exec web bundle exec brakeman -q --no-pager
docker compose exec web bundle exec bundler-audit check --update
docker compose exec web bundle exec rubocop
docker compose exec web bundle exec rails boundaries:check
```

`bin/ci-parity` asserts every `# parity` step in `ci.yml` is represented in `make verify`; if you add a parity step, add it to `make verify` too.

**Known temporary red:** the `knip` job reports **unused exports/types** from the Wave-0 kit (`app/javascript/components/**`) and API hooks (`app/javascript/api/hooks/**`) that the Wave 1+ lanes have not consumed yet. It goes green as those lanes land; it is not caused by W0-7. If it blocks a lane before then, that is a build-out condition, not a lane defect.

## Why the real exports never run in CI

The only real data (`handoff/takehome/exports/{harbor,lakeside}/`, up to 69 MB / ~625k rows) is health-like and lives **only on the owner's machine** ([`real-data.md`](./real-data.md)). CI has no exports and must never have them:

- `guards` fails if any export path, `.env`, key or stray CSV is tracked.
- `:real_data` RSpec tags and `@real` Playwright tags are skipped by construction.
- `e2e_real` uploads a **synthetic** export built by `bin/generate-sample-export` (Harbor-shaped, seeded) through the browser instead.

## Screenshots

`e2e_mock` and `e2e_real` upload their screenshots (`e2e/screenshots`, `test-results`) as artifacts on every run, passing or failing. The lane PR pastes the desktop (1280×800) and mobile (390×844) screenshots next to the matching `handoff/design/screenshots/` image.

## Deploy

`deploy` runs only on `main`, only when every required job passed, in concurrency group `deploy-production` (never cancelled). It uses `FLY_API_TOKEN` from the GitHub **environment `production`** and then polls `/up`, `/` and `/api/v1/me`. First-time setup, secrets and rollback: [`docs/operations/`](../operations/README.md).

# CI/CD

One workflow, [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml), on `pull_request`, `push: main` and a nightly schedule. It gives every lane PR fast feedback and deploys `main` to Fly.io on green. Design: [`spec 2200`](../superpowers/specs/2026-10/2026-10-14-2200-ci-cd-pipeline-design.md). Runbooks: [`docs/operations/`](../operations/README.md).

**Local = CI.** Every command a job runs is part of `make verify` (checked by `bin/ci-parity`), so passing `make verify` passes CI, except the environment-only jobs (`docker_build`, `deploy`, `e2e_real`). Budget: **≤ 12 minutes** wall-clock on a PR.

## Jobs

| Job | Guards | Required on `main` |
|---|---|---|
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
| `ownership_check` | PRs from `lane/*` branches: changed files are inside the lane's `Owns` list (`bin/lane-id-from-branch` derives the id). | no: not in the required list (it only runs on lane PRs); the review gate checks ownership too |
| `docker_build` | The production image builds (no push) and ships no source maps. | yes |
| `deploy` | Fly deploy + post-deploy health checks (`/up`, `/`, `/api/v1/me` → 401; each failure fails the job). `main` only. | no: runs after merge, not a PR gate |

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

`bin/ci-parity` enforces: every `run:` step in `ci.yml` is marked `# parity` (also in `make verify`, with the **same flags**: e.g. `npm audit --omit=dev --audit-level=high` on both sides) or `# ci-only` (setup, environment-only, reporting); an unmarked step fails. Add a new CI check as `# parity` and put it in `make verify` too.

**knip:** unused exports and types are *warnings* in `knip.json` until W3-1 restores them to errors (the Wave-0 kit and API hooks are not consumed until the Wave-1 lanes land); unused files and dependencies still fail the job.

**Main always runs the full pipeline.** Branch protection is `strict: false` and lanes auto-merge in parallel, so the squashed commit on `main` is a combination nobody tested on a PR: CI runs in full on every push to `main`, and `deploy` needs every job of that same run.

**Dependabot** updates the `github-actions` and base-image ecosystems from literal references only: the Dockerfile uses literal `FROM ruby:<x.y.z>-slim` and `COPY --from=node:22-…` tags (never an `ARG`), and third-party actions are pinned to a commit SHA with the version in a comment.

## Why the real exports never run in CI

The only real data (`handoff/takehome/exports/{harbor,lakeside}/`, up to 69 MB / ~625k rows) is health-like and lives **only on the owner's machine** ([`real-data.md`](./real-data.md)). CI has no exports and must never have them:

- `guards` fails if any export path, `.env`, key or stray CSV is tracked.
- `:real_data` RSpec tags and `@real` Playwright tags are skipped by construction.
- `e2e_real` uploads a **synthetic** export built by `bin/generate-sample-export` (Harbor-shaped, seeded) through the browser instead.

## Screenshots

`e2e_mock` and `e2e_real` upload their screenshots (`e2e/screenshots`, `test-results`) as artifacts on every run, passing or failing. The lane PR pastes the desktop (1280×800) and mobile (390×844) screenshots next to the matching `handoff/design/screenshots/` image.

## Deploy

`deploy` runs only on `main`, only when every job of that same run passed, in concurrency group `deploy-production` (never cancelled). It uses `FLY_API_TOKEN` from the GitHub **environment `production`** and then polls `/up`, `/` and `/api/v1/me`. First-time setup, secrets and rollback: [`docs/operations/`](../operations/README.md).

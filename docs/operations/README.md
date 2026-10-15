# Operations runbooks

Human, owner-run procedures for Simbe's production environment. **Nothing here is automated and nothing here is run by a coding agent** (agents are forbidden from `fly`, `gh repo`, and remote changes). The CI/CD pipeline builds and deploys on `main`; these runbooks cover the one-time setup and the things a human must do by hand.

CI/CD design: [`docs/superpowers/specs/2026-10/2026-10-14-2200-ci-cd-pipeline-design.md`](../superpowers/specs/2026-10/2026-10-14-2200-ci-cd-pipeline-design.md). Pipeline reference: [`docs/conventions/ci.md`](../conventions/ci.md).

## Index

| Runbook | Read it when |
|---|---|
| [secrets.md](./secrets.md) | Before the first deploy, and whenever a secret must be added or rotated. |
| [deploy.md](./deploy.md) | First-time Fly setup, the first deploy, and to understand routine (merge-to-`main`) deploys. |
| [rollback.md](./rollback.md) | A deploy broke production and you need the previous release. |
| [backups.md](./backups.md) | Setting up backups, and for the quarterly restore drill. |

## Rules

1. **Humans do these by hand.** No agent, script or CI job runs `fly`, sets secrets, or touches the remote.
2. **Order matters on day one:** secrets → deploy → GitHub environment → `bin/setup-github --apply`. `bin/setup-github` is a dry run unless you pass `--apply`.
3. **Back up the encryption keys before the first deploy.** Losing `AR_ENCRYPTION_*` makes stored screener answers permanently unreadable ([secrets.md](./secrets.md)).
4. Anything not confirmed against the current Fly.io documentation is marked **unverified** — product names and prices change; confirm before you rely on them.

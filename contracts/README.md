# Simbe API contract

OpenAPI 3.1, split by domain. **Single source of truth** for every HTTP payload (see `docs/superpowers/specs/2026-10/2026-10-14-2100-parallel-build-architecture-design.md`).

```
contracts/
  openapi/openapi.yaml        root: servers, tags, path index, shared responses/parameters
  openapi/paths/<domain>.yaml  operations (operationId, params, responses, examples)
  openapi/schemas/<domain>.yaml  schemas
  examples/<domain>/*.json    fixtures derived from the Alpha scenario (used by mocks AND inlined as OpenAPI examples)
  .redocly.yaml               lint rules
```

Domains: `auth`, `account` (signup, agency, team, invitations, ad connections), `snapshots`, `metrics`, `leads`, `next-actions`, `coordinators`, `agent`, `mcp`.

## Commands

```bash
npx @redocly/cli@1 bundle contracts/openapi/openapi.yaml -o contracts/dist/openapi.bundled.yaml
npx @redocly/cli@1 lint contracts/dist/openapi.bundled.yaml --config contracts/.redocly.yaml   # validates every example against its schema
```
(Linting the *bundled* file is what checks the `$ref`'d example files.)

## Rules

- Lanes **consume** the contract; they don't edit it. Need a field/endpoint? Open a **Contract Change Request**: a small PR touching only `contracts/**`, labelled `ccr`, merged first; everyone rebases.
- JSON is `snake_case`; timestamps ISO-8601 UTC; money in integer cents; rates in percent (one decimal); `null` is explicit (never omit a nullable key).
- Errors always `{ "error": { "code", "message" } }` (plus extra keys like `valid_names`, `report`).
- Tenancy: another agency's or another coordinator's ids are **404**, never 403. Role violations are 403.
- Every non-GET needs `X-Requested-With: simbe`.
- Examples use Alpha numbers (10 leads, `as_of` 2026-10-01T12:00Z). Do not change a number without updating every test that asserts it (listed in the plans).
- Not in OpenAPI (documented in the agent/MCP spec): the MCP JSON-RPC endpoint `POST /mcp/{slug}` (outside `/api/v1`).

## Naming deviations from the first-draft plans

`GET /leads/board` (board) vs `GET /leads` (list/search); `GET /invitations/{token}/preview` (public preview) vs `DELETE /invitations/{id}`; `GET /ad_connections` and `GET /coordinator_names` return objects (`{connections: []}`, `{names: []}`).

## Snapshot uploads are asynchronous (real exports are up to 69 MB / ~625k rows)

`POST /snapshot_uploads` stores the files and returns `201` immediately (`status: validating`); validation and the replace-in-one-transaction import run as background jobs. Clients poll `GET /snapshot_uploads/{id}` (status `validating → validated → committing → committed`, `progress {phase, pct, rows_done, rows_total}`, `report`, `snapshot`, `error`); `POST …/commit` returns `202`; `GET /snapshots/current` carries `pending` so any screen can show "Loading your data…". The same CSVs may be uploaded by any number of agencies: the API never inspects other agencies' data (no `foreign_lead` error).

## Contract Change Requests (CCR)

When a lane needs a field or endpoint the contract does not have, do not hack around it — open a CCR:

1. Branch `ccr/<topic>` off `main`.
2. Change **only** `contracts/**` (OpenAPI + examples) and, when the generated types moved, the regenerated `app/javascript/api/generated/schema.d.ts` (`make types`).
3. If the change affects the mock or a hook, add/adjust the handler under `app/javascript/mocks/**` and the hook under `app/javascript/api/hooks/**` in the same PR — a `ccr` PR is the only PR allowed to touch those two trees alongside `contracts/**`.
4. Label the PR `ccr`. The ownership check skips `contracts/**` plus the generated types for `ccr` PRs, and merging one is announced so every open lane rebases.
5. `make contract` (bundle + lint with examples validated) and `make web-test ARGS=app/javascript/mocks` (conformance: every operation has a handler and every default response validates against the schema) must pass.


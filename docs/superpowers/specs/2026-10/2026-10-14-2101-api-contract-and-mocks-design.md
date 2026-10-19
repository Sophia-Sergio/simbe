# API contract, generated client, mocks and conformance — Design

> **Layout superseded by [`2300-rails-monolith-and-packs`](./2026-10-14-2300-rails-monolith-and-packs-design.md):** the app is one Rails monolith with embedded React (`vite_rails`) and backend packs; paths below were migrated mechanically (`app/packs/<pack>/…`, `app/javascript/…`). Product and process decisions here still stand.

**Status:** Approved for planning · **Depends on:** `2100` · **Plan:** `plans/2026-10/2026-10-14-2105-w0-2-contract-tooling.md` (backend conformance wiring is in `…-2106-w0-3-backend-core.md`)

## Goal
Make the HTTP contract executable: a validated OpenAPI file, generated TypeScript types and typed hooks, an in-browser/in-test mock API, and conformance checks on both ends — so frontend lanes run with no backend and backend lanes can't silently drift from what the UI expects.

## Findings
- `contracts/openapi/` (committed with this spec) defines 39 operations with Alpha-derived examples that lint clean once bundled (`contracts/README.md`).
- The existing UI plans already name hooks and payload shapes (`useSummary`, `useBoard`, `useToggleDone`, …) and mock with `mockApi({...})` keyed by `"METHOD path"` — these names are kept so those plans stay valid.
- Stateful UI flows need a mock that remembers (Done toggles, team invites, upload review → commit), which a static mock server (Prism) cannot do.
- Real behavior must still be validated by someone: OpenAPI-driven request/response validation on the Rails side catches drift automatically.

## Decisions
1. **Bundle + lint** is `make contract`: bundles to `contracts/dist/openapi.bundled.yaml` (git-ignored) and lints the bundle (validates all examples). CI runs it first. Generated types are committed (`app/javascript/api/generated/schema.d.ts`) and CI fails if `make types` produces a diff.
2. **Types and client**: `openapi-typescript` → `schema.d.ts`; `app/javascript/api/types.ts` re-exports friendly aliases (`Summary`, `Funnel`, `Channels`, `ChannelDetail`, `Recommendation`, `LeadCard`, `LeadDetail`, `Board`, `NextActions`, `CoordinatorRow`, `CoordinatorDetail`, `Me`, `Agency`, `SnapshotCurrent`, `Report`, `AgentBody`, …); `app/javascript/api/client.ts` provides `jsonRequest`, `ApiError { status, code, message, extra }` (keeps extra envelope keys such as `valid_names`, `report`), and `uploadFiles(path, files)` (multipart, same CSRF header).
3. **Typed hooks** live one file per domain in `app/javascript/api/hooks/` (`auth.ts`, `account.ts`, `snapshots.ts`, `metrics.ts`, `leads.ts`, `nextActions.ts`, `coordinators.ts`, `agent.ts`, `mcp.ts`) — no barrel file. Query keys are fixed so lanes can invalidate each other's data: `["me"]`, `["agency"]`, `["team"]`, `["snapshot"]`, `["metrics", "summary"|"funnel"|"channels"|"channel"|"recommendations", …args]`, `["leads", "board"|"list"|"detail"|"search", …args]`, `["next_actions", coordinator]`, `["coordinators", …]`, `["agent", "suggestions"]`, `["mcp"]`. Mutations invalidate by these prefixes (e.g. committing a snapshot invalidates `["snapshot"]`, `["metrics"]`, `["leads"]`, `["next_actions"]`, `["coordinators"]`).
4. **MSW mocks** (`msw@2`): `app/javascript/mocks/handlers/<domain>.ts` import the contract examples (`contracts/examples/**`) through a Vite alias `@contracts`; `app/javascript/mocks/db.ts` holds mutable state (next-action completions, team/invitations, upload sessions, agent conversations, current role/agency, MCP key). `app/javascript/mocks/browser.ts` (dev + Playwright) and `app/javascript/mocks/server.ts` (Vitest). Mock rules: sign in as `erin@harbor.test` → owner; `dana@harbor.test` → coordinator (Dana Ortiz); any non-empty password ≥ 1 char works; wrong email → 401 `invalid_credentials`; role gates match the contract (coordinator on owner routes → 403; unknown ids → 404). Scenario switches via `?mock=empty|error|slow|coordinator|new` (read once at boot) and per-test `mockApi` overrides.
5. **Mock conformance test** (`app/javascript/mocks/conformance.test.ts`): bundles the OpenAPI at test time, calls every handler through the MSW server with a canned request and validates each response body against the operation's response schema (`ajv` 2020-12). It fails when a fixture drifts from the contract. A second test asserts every `operationId` has a handler (coverage).
6. **Test helpers** (`app/javascript/test/`): `mockApi(overrides)` takes `{ "GET /api/v1/leads/board": body | (req) => Response, "/api/v1/x?range=30d": body }` (method defaults to GET; query strings match exactly), layered over default handlers; `setViewport(width)` stubs `matchMedia`/`innerWidth` and fires `resize`. (`renderWithProviders` ships in the app-core plan.)
7. **Mock mode switch**: `VITE_API_MODE=mock|real` (default `mock` until Wave 3 flips it). In `mock` mode `main.tsx` starts the MSW worker before rendering and shows a small "Mock API" chip in the corner (dev only).
8. **Backend conformance**: `openapi_first` is registered against the bundled contract in `spec/support/contract.rb`; every request spec's request and response are validated automatically; `make contract-coverage` prints which operations no spec exercised. Request specs for a lane's endpoints must pass with conformance on (no `skip`). (Fallback if the gem can't read OpenAPI 3.1: `committee` with the 3.0-downlevelled bundle produced by `redocly bundle --dereferenced` — decided by the contract-tooling implementer and noted in the PR.)
9. **Contract Change Requests**: PRs labelled `ccr` that touch only `contracts/**` (plus regenerated `schema.d.ts`) skip the ownership check; merging one triggers a rebase of open lanes. The contract tooling lane documents the procedure in `contracts/README.md`.
10. **Fixtures as data, not code**: handlers never inline payloads; they read `contracts/examples/**`. Tests that need variants override via `mockApi` with spread objects.

## Non-goals
Mocking the MCP JSON-RPC endpoint, a mock for the CSV importer's heavy validation (the upload mock fakes a plausible report from file names), Prism/Stoplight hosting, GraphQL, contract versioning.

## Acceptance criteria
1. `make contract` exits 0 (bundle + lint with examples validated) and `grep -c "operationId:" contracts/openapi/paths/*.yaml | awk -F: '{s+=$2} END {exit !(s==39)}'` exits 0.
2. `make types && git diff --exit-code app/javascript/api/generated` exits 0 (types committed and current).
3. `make web-test ARGS=app/javascript/api app/javascript/mocks` passes, including `app/javascript/mocks/conformance.test.ts` (every operation has a handler; every default response validates).
4. `VITE_API_MODE=mock make web-dev` then signing in as `erin@harbor.test` shows the shell with no Rails server running: `docker compose stop api && make e2e ARGS=mock-smoke` passes.
5. `make spec ARGS=spec/requests/me_spec.rb` passes with `openapi_first` validation on, and `make contract-coverage` lists unexercised operations (informational until Wave 3).
6. `grep -rn "fetch(" app/javascript --include=*.ts --include=*.tsx | grep -v "app/javascript/api/client.ts\|\.test\.\|app/javascript/mocks" ` prints nothing (HTTP only through `client.ts`).

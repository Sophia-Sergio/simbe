# W0-2 Contract Tooling, Typed Hooks and Mock API Implementation Plan

> **For Cursor / OpenCode:** Implement task-by-task. Follow `docs/conventions/`. Stop if blocked — do not replan silently. **Commit after every task** (`feat(api-layer): task N – <title>`). Tasks 4–8 touch disjoint files and may be split across agents.

**Lane:** W0-2 · **Wave:** 0 (parallel with W0-3, W0-4A after W0-1)
**Owns:** `app/javascript/api/**`, `app/javascript/mocks/**`, `app/javascript/test/mockApi.ts`, `app/javascript/test/setup.ts`, `e2e/mock-smoke.spec.ts`, `contracts/README.md`, `contracts/.redocly.yaml`
**Depends on (merged):** W0-1
**Unblocks:** every frontend lane (hooks + mocks), W0-5
**Goal:** Executable contract: `make contract`, generated types, `client.ts`, typed hooks for all 39 operations, a stateful MSW mock of the whole API, conformance tests, and the `mockApi` test helper.
**Spec:** `docs/superpowers/specs/2026-10/2026-10-14-2101-api-contract-and-mocks-design.md`

## Global Constraints
- The OpenAPI files under `contracts/openapi/**` and examples under `contracts/examples/**` are **read-only here** (already merged); changes go through a CCR.
- All HTTP in the app goes through `app/javascript/api/client.ts`. No barrel file in `app/javascript/api/hooks/`.
- Query keys are exactly those in spec `2101` decision 3.
- Handlers read fixtures from `@contracts/examples/**`; no inline payloads.

## Review Focus
- 401 from any hook (expired session) must surface as `ApiError{status:401}` so `AuthProvider` can redirect.
- `ApiError.extra` preserves `valid_names` and `report` (the UI needs them).
- Mock role gates: coordinator on owner routes → 403; unknown/foreign ids → 404.
- `useToggleDone` rolls back on failure (no stuck optimistic state).
- Multipart upload sends the CSRF header and no manual `Content-Type`.

---

## File Map

| Action | Path |
|--------|------|
| Create | `app/javascript/api/{client.ts,types.ts,range.ts,format.ts}`, `app/javascript/api/generated/schema.d.ts` |
| Create | `app/javascript/api/hooks/{auth,account,snapshots,metrics,leads,nextActions,coordinators,agent,mcp}.ts` (+ `.test.tsx` each) |
| Create | `app/javascript/mocks/{db.ts,browser.ts,server.ts,scenarios.ts,conformance.test.ts}`, `app/javascript/mocks/handlers/<domain>.ts` |
| Create | `app/javascript/test/{setup.ts,mockApi.ts,mockApi.test.ts}`, `e2e/mock-smoke.spec.ts` |
| Modify | `contracts/README.md` (CCR procedure); `make contract` / `make types` already exist (W0-1) |
| Create | `app/javascript/mocks/bootstrap.ts` (`startMocks`, `MockChip`; consumed by W0-5's `main.tsx`) |

---

## Task 1: Bundle, lint, generate types

- [ ] **Step 1:** `npm run contract` (script from W0-1, runs on the host with Node 22 — no Docker) → bundle + lint exit 0. **Step 2:** `make types` generates `app/javascript/api/generated/schema.d.ts`; commit it. **Step 3:** CI job `contract` already diff-checks it.
- [ ] **Step 4:** `app/javascript/api/types.ts`:
```ts
import type { components } from "./generated/schema";
type S = components["schemas"];
export type Me = S["Me"]; export type User = S["User"]; export type Agency = S["Agency"];
export type Range = S["Range"]; export type Milestone = S["Milestone"]; export type Role = S["Role"];
export type Summary = S["Summary"]; export type Funnel = S["Funnel"]; export type FunnelStage = S["FunnelStage"];
export type Channels = S["Channels"]; export type ChannelRow = S["ChannelRow"]; export type ChannelDetail = S["ChannelDetail"];
export type Recommendation = S["Recommendation"];
export type LeadCard = S["LeadCard"]; export type Board = S["Board"]; export type LeadList = S["LeadList"]; export type LeadDetail = S["LeadDetail"];
export type Status = S["Status"]; export type NextActions = S["NextActions"]; export type TaskItem = S["TaskItem"]; export type QueueKey = S["QueueKey"];
export type CoordinatorRow = S["CoordinatorRow"]; export type CoordinatorDetail = S["CoordinatorDetail"];
export type Team = S["Team"]; export type Invitation = S["Invitation"]; export type AdConnection = S["AdConnection"]; export type AdPlatform = S["AdPlatform"];
export type SnapshotCurrent = S["SnapshotCurrent"]; export type Snapshot = S["Snapshot"]; export type Report = S["Report"]; export type SnapshotUpload = S["SnapshotUpload"];
export type AgentBody = S["AgentBody"]; export type AgentMessage = S["AgentMessage"]; export type McpSettings = S["McpSettings"];
```
Commit.

---

## Task 2: client.ts

**Files:** `app/javascript/api/client.ts`, `app/javascript/api/client.test.ts`.
**Interfaces — Produces:**
```ts
export class ApiError extends Error { constructor(public status: number, public code: string, message: string, public extra: Record<string, unknown> = {}) }
export function jsonRequest<T = unknown>(method: string, path: string, body?: unknown): Promise<T>
export function uploadFiles<T = unknown>(path: string, files: File[]): Promise<T>   // multipart field name "files"
export const API = "/api/v1";
```
- [ ] **Step 1: Failing tests**
```ts
import { jsonRequest, uploadFiles, ApiError } from "./client";
afterEach(() => vi.unstubAllGlobals());
it("sends CSRF header and JSON body", async () => {
  const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: 1 }), { status: 200 })); vi.stubGlobal("fetch", f);
  await expect(jsonRequest("POST", "/api/v1/x", { a: 1 })).resolves.toEqual({ ok: 1 });
  const init = f.mock.calls[0][1];
  expect(init.headers["X-Requested-With"]).toBe("simbe"); expect(init.headers["Content-Type"]).toBe("application/json"); expect(init.credentials).toBe("same-origin");
});
it("returns undefined on 204", async () => { vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 }))); await expect(jsonRequest("DELETE", "/api/v1/x")).resolves.toBeUndefined(); });
it("throws ApiError with code, message and extra keys", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "unknown_coordinator", message: "no" }, valid_names: ["A"] }), { status: 422 })));
  await expect(jsonRequest("POST", "/api/v1/x", {})).rejects.toMatchObject({ status: 422, code: "unknown_coordinator", extra: { valid_names: ["A"] } });
});
it("maps non-JSON failures to ApiError unknown", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>", { status: 502 })));
  await expect(jsonRequest("GET", "/api/v1/x")).rejects.toBeInstanceOf(ApiError);
});
it("uploadFiles posts multipart without a manual content type", async () => {
  const f = vi.fn().mockResolvedValue(new Response("{}", { status: 201 })); vi.stubGlobal("fetch", f);
  await uploadFiles("/api/v1/snapshot_uploads", [new File(["a"], "leads.csv")]);
  const init = f.mock.calls[0][1];
  expect(init.body).toBeInstanceOf(FormData); expect(init.headers["Content-Type"]).toBeUndefined(); expect(init.headers["X-Requested-With"]).toBe("simbe");
});
```
- [ ] **Step 2:** FAIL. **Step 3: Implement**
```ts
export const API = "/api/v1";
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public extra: Record<string, unknown> = {}) { super(message); this.name = "ApiError"; }
}
async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const { error, ...extra } = (data ?? {}) as { error?: { code?: string; message?: string } } & Record<string, unknown>;
    throw new ApiError(res.status, error?.code ?? "unknown", error?.message ?? res.statusText, extra);
  }
  return data as T;
}
export async function jsonRequest<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, { method, credentials: "same-origin",
    headers: { Accept: "application/json", ...(body !== undefined ? { "Content-Type": "application/json" } : {}), "X-Requested-With": "simbe" },
    body: body !== undefined ? JSON.stringify(body) : undefined });
  return parse<T>(res);
}
export async function uploadFiles<T = unknown>(path: string, files: File[]): Promise<T> {
  const form = new FormData(); files.forEach((f) => form.append("files", f));
  const res = await fetch(path, { method: "POST", credentials: "same-origin", headers: { Accept: "application/json", "X-Requested-With": "simbe" }, body: form });
  return parse<T>(res);
}
```
- [ ] **Step 4:** `make web-test ARGS=app/javascript/api/client` → pass. Commit.

---

## Task 3: Mock core — db, scenarios, server/browser, mockApi helper

**Files:** `app/javascript/mocks/{db.ts,scenarios.ts,browser.ts,server.ts,bootstrap.ts}`, `app/javascript/test/{setup.ts,mockApi.ts,mockApi.test.ts}`. (The React entrypoint `app/javascript/entrypoints/application.tsx` is owned by W0-1/W0-5; this task only provides `startMocks()` and `MockChip`.)
**Interfaces — Produces:**
```ts
// db.ts — in-memory state, reset(): void, persisted session in localStorage "simbe_mock_session" (mock only)
export const db: { session: { email: string; role: "owner"|"coordinator" } | null; completions: Set<string> /* `${lead_id}:${queue}` */;
  team: Team; connections: AdConnection[]; uploads: Map<string, { report: Report; files: string[] }>; mcp: { key_prefix: string|null; created_at?: string };
  conversations: Map<string, AgentMessage[]>; agency: Agency; snapshot: SnapshotCurrent; reset(): void };
export const apiPath = (p: string) => `/api/v1${p}`;
// scenarios.ts — reads ?mock=empty|error|slow|coordinator|new once at boot: export const scenario: "default"|"empty"|"error"|"slow"|"coordinator"|"new"
// server.ts — export const server = setupServer(...allHandlers); browser.ts — export const worker = setupWorker(...allHandlers)
// mockApi.ts
export function mockApi(overrides: Record<string, unknown | ((req: Request) => Response | Promise<Response>)>): void
export function setViewport(width: number): void
```
`mockApi` keys: `"GET /api/v1/x?range=30d"`, `"POST /api/v1/x"`, or just a path (GET). Matching: method + pathname exact, and when the key has a query string, every key param must equal the request's param. Value object → `HttpResponse.json(value)`; function → called. Layered with `server.use(...)`; `setup.ts` resets handlers and `db.reset()` after each test, starts the server `onUnhandledRequest: "error"`, and installs `@testing-library/jest-dom`.
- [ ] **Step 1: Failing tests** (`mockApi.test.ts`)
```ts
it("serves the default handler and overrides by method+path+query", async () => {
  const r1 = await fetch("/api/v1/metrics/summary?range=30d"); expect((await r1.json()).kpis.leads.value).toBe(10);   // default requires prior sign-in; see db.session seed in tests
  mockApi({ "GET /api/v1/metrics/summary?range=90d": { range: "90d", snapshot: null, kpis: {} } });
  expect((await (await fetch("/api/v1/metrics/summary?range=90d")).json()).range).toBe("90d");
  expect((await (await fetch("/api/v1/metrics/summary?range=30d")).json()).range).toBe("30d");  // other query untouched
});
it("function overrides can return errors", async () => {
  mockApi({ "POST /api/v1/agent/messages": () => new Response(JSON.stringify({ error: { code: "already_in_progress", message: "x" } }), { status: 409 }) });
  expect((await fetch("/api/v1/agent/messages", { method: "POST", headers: { "X-Requested-With": "simbe" } })).status).toBe(409);
});
it("setViewport flips matchMedia and fires resize", () => {
  setViewport(390); expect(window.matchMedia("(min-width: 860px)").matches).toBe(false);
  setViewport(1280); expect(window.matchMedia("(min-width: 860px)").matches).toBe(true);
});
it("unhandled requests fail the test", async () => { await expect(fetch("/api/v1/nope")).rejects.toThrow(); });
```
In the test setup, `db.session` defaults to the owner (`erin@harbor.test`) so default handlers authenticate; a helper `asRole("coordinator")` in `mockApi.ts` flips it.
- [ ] **Step 2:** FAIL; **Step 3:** implement. `app/javascript/mocks/bootstrap.ts`: `export async function startMocks(): Promise<void> { if (import.meta.env.VITE_API_MODE === "real") return; const { worker } = await import("./browser"); await worker.start({ onUnhandledRequest: "bypass" }); }` plus `export const MockChip` (dev-only corner chip "Mock API · <scenario>", rendered by W0-5's entrypoint). **The MSW service worker file is generated into the mock host's own public dir, never into Rails' `public/`** (so it can never ship in the production image): `npx msw init app/javascript/mock-host/public --save=false`, committed. `startMocks()` runs in two situations: the standalone **mock host** (`npm run dev:mock`, always mock) and the Rails-embedded dev server when `VITE_API_MODE=mock` is set in `.env` (default `real` there).
- [ ] **Step 4:** pass. Commit.

---

## Task 4: Mock handlers — auth, account, snapshots (parallelizable)

**Files:** `app/javascript/mocks/handlers/{auth,account,snapshots}.ts`, `app/javascript/mocks/handlers/index.ts` (the only aggregator; add each domain in its own task's commit).
Rules (spec `2101` decision 4): sign-in `erin@harbor.test` → owner session; `dana@harbor.test` → coordinator; others → 401 `invalid_credentials`; `GET /me` → 401 without session; `DELETE /session` clears; `signup` creates a session as a new owner (email `taken@x.test` → 422 `email_taken`; password < 10 → 422 `weak_password`); `GET/PATCH /agency` mutate `db.agency` (owner only, else 403); `team` returns `db.team`; `POST /invitations` → unknown coordinator names (not in `["Dana Ortiz","Jess Kim","Priya Shah"]`) → 422 `unknown_coordinator` with `valid_names`, else 201 with `accept_url` `http://localhost:5173/invite/<token>` and a pending row; `GET /invitations/{token}/preview` → fixture, token `expired` → 410; accept → session as coordinator; `ad_connections` list/connect/disconnect mutate `db.connections`; `snapshot_uploads` are **asynchronous** (mirror the real API): `POST` reads the uploaded file names, stores a session in `db.uploads` and returns `201` `upload-created.json` shape (`status: validating`); `GET /snapshot_uploads/{id}` advances a small state machine per poll — `validating` for the first 2 polls (progress phases `storing → parsing → validating`, pct rising), then `validated` with the report (all seven names present → `upload-ok.json` report with `ignored` for unknown names; otherwise `upload-errors.json` with a `missing_file` error per missing name); `POST …/commit` → `409 not_validated` if still validating, `422 invalid_snapshot` + report if `report.ok === false`, `409 already_in_progress` if another upload of the session is committing (and always in the `slow` scenario's second call), else `202` `upload-committing.json` shape; subsequent polls report `committing` with `importing`/`computing` progress (pct 10 → 100 over ~4 polls, `rows_done/rows_total`) then `committed` with the new `snapshot` (also written to `db.snapshot`); `DELETE` marks `cancelled`; `GET /snapshots/current` returns `pending` (`upload_id`, `status`, `progress`) while an upload is validating/committing, honors scenario `empty/new` (→ `{snapshot:null,pending:null,files:[]}`) and `?mock=loading` (→ `current-loading.json`). Tick speed is injectable (`db.uploadTickMs`, 0 in tests so polls advance instantly).
- [ ] **Step 1:** Write one Vitest file per domain (`handlers/auth.test.ts`, …) exercising each rule above through `fetch` (examples: wrong email 401; coordinator `GET /team` 403; invitation with `Nobody` 422 with `valid_names`; upload with 6 files → polling reaches `validated` with `report.ok === false` and a `missing_file` error naming the absent file; commit invalid → 422; commit before validated → 409 `not_validated`; commit ok → 202, polling shows `committing` with rising `pct` then `committed`, and `GET /snapshots/current` shows the new `as_of` and `pending: null` — and `pending` is non-null while committing).
- [ ] **Step 2:** FAIL; **Step 3:** implement with `http` from `msw`, fixtures via `import ... from "@contracts/examples/…json"`; **Step 4:** pass. Commit (one commit per domain file).

---

## Task 5: Mock handlers — metrics, leads, next actions, coordinators (parallelizable)

**Files:** `app/javascript/mocks/handlers/{metrics,leads,nextActions,coordinators}.ts` (+ tests).
Rules: all four are **owner-only** except where noted. `range` ∉ {30d,90d,12m} → 422 `bad_range`; empty/`new` scenarios return `summary-empty.json`, `[]`, empty board, zero queues; `channels/{channel}`: `Facebook` → fixture, others in `Instagram|Google|Referral|TikTok|Unknown` → fixture with `channel` swapped and zeroed KPIs, anything else → 404; `GET /leads/board` returns `board.json` (coordinator sessions: only cards whose `coordinator` is Dana, counts recomputed); `GET /leads` supports `status` (open default; `all` adds closed/paused cards from an in-file extra array), `q` (case-insensitive contains on name, max 8 results, `%`/`_` literal), `coordinator` (owner only); `GET /leads/{id}`: only `aaaaaaaa-…0004` has a full detail fixture (owner/coordinator variants chosen by the session; coordinator whose name ≠ lead's coordinator → 404); other known lead ids synthesize a detail from the card fixture with empty process/activity; unknown ids → 404; `next_actions` returns the fixture with `done` flags and counts recomputed from `db.completions`, coordinator sessions only see Dana's three items; `POST/DELETE …/completion` update `db.completions` (unknown lead/queue combo → 404, bad queue → 422); `coordinators` list/detail owner-only (coordinator → 403), unknown name → 404.
- [ ] **Step 1:** tests per domain (e.g. board for a coordinator session has `action_needed.count === 3` and no `qualified` cards of other coordinators; `POST completion` twice → `done: true` twice and `GET next_actions` progress `{done:1,total:4}`; `DELETE` twice → back to 0; `GET /leads?q=%` → `leads: []`; `GET /leads/<L1 id>` as Dana → 404).
- [ ] **Step 2:** FAIL; **Step 3:** implement; **Step 4:** pass. Commit per domain.

---

## Task 6: Mock handlers — agent and MCP settings

**Files:** `app/javascript/mocks/handlers/{agent,mcp}.ts` (+ tests).
Rules: `POST /agent/messages`: empty text → 422 `empty_text`; > 500 chars → 422 `text_too_long`; scenario `error` → 502 `model_unavailable`; a second call while the first is pending (scenario `slow` delays 1500 ms) → 409 `already_in_progress`; otherwise 201 with `answer.json` (text echoes the question when it contains "Google" → a shorter canned answer) and appends to `db.conversations`; `GET /agent/conversations/{id}`; `GET /agent/suggestions` → 4 owner chips or 3 coordinator chips; `GET /agent/usage` owner-only; `GET /mcp` → fixture (`key_prefix: null` in `new`); `POST /mcp/rotate` → 201 with a fresh random key `simbe_live_<24 chars>` and updates `db.mcp.key_prefix` (owner only).
- [ ] **Steps 1–4** as above (tests for each rule). Commit.

---

## Task 7: Typed hooks (parallelizable by file)

**Files:** `app/javascript/api/hooks/{auth,account,snapshots,metrics,leads,nextActions,coordinators,agent,mcp}.ts` + tests. Tests use `mockApi` and a `renderHook` wrapper (`QueryClientProvider` with `retry: false`).
**Interfaces — Produces (exact names; these are what every lane imports):**

| File | Exports |
|---|---|
| `auth.ts` | `useMe()` → `["me"]`; `useSignIn()`; `useSignOut()` (clears the whole query cache) |
| `account.ts` | `useAgency()`; `useUpdateAgency()` (optimistic `["me"]`/`["agency"]`, invalidates `["metrics"]`,`["leads"]`,`["coordinators"]`); `useSignup()`; `useTeam()`; `useInviteCoordinator()`; `useDeleteInvitation()`; `useInvitationPreview(token)`; `useAcceptInvitation(token)`; `useCoordinatorNames()`; `useAdConnections()`; `useConnectPlatform()`; `useDisconnectPlatform()` |
| `snapshots.ts` | `useCurrentSnapshot()` (refetches every 2 s while `pending` is non-null so every screen's "Loading your data…" state clears itself); `useSnapshotUpload()` → `{ state: "idle"\|"uploading"\|"validating"\|"review"\|"committing"\|"done"\|"error", files, progress: {phase, pct, rows_done?, rows_total?} \| null, report, error, upload(files: File[]), commit(), cancel(), reset() }` — **polls** `GET /snapshot_uploads/{id}` every 1 s (500 ms while `progress.pct` is moving, stops on terminal states and on unmount, resumes for an in-flight upload found in `useCurrentSnapshot().pending`); `uploading` covers the multipart request itself (with upload progress from `XMLHttpRequest`/`fetch` streams where available, otherwise indeterminate); `review` = `validated` (the report may still have `ok: false`); single-flight; a 409 sets `error.code === "already_in_progress"` or `"not_validated"`; a `failed` status maps to `error`; successful commit (`committed`) invalidates `["snapshot"]`,`["metrics"]`,`["leads"]`,`["next_actions"]`,`["coordinators"]`) |
| `metrics.ts` | `useSummary(range)`, `useFunnel(range)`, `useChannels(range)`, `useChannel(channel, range)` (path-encodes `channel`), `useRecommendations(range)`; `staleTime: 60_000` |
| `leads.ts` | `useBoard(coordinator?)`, `useLeadList({ status?, coordinator?, q? })` (infinite query on `next_cursor`), `useLead(id: string \| null)` (disabled when null), `useLeadSearch(q)` (enabled for `q.length ≥ 2`, 200 ms debounce) |
| `nextActions.ts` | `useNextActions(coordinator?)`, `useToggleDone()` → `{ toggle(leadId, queue, done) }` optimistic: flips the item's `done`, adjusts the queue `count` and `progress.done`; on error restores and calls `useToast().show("Couldn't save — try again")`; invalidates `["next_actions"]`, `["leads","detail"]` |
| `coordinators.ts` | `useCoordinators()`, `useCoordinator(name)` (path-encodes) |
| `agent.ts` | `useAgentSuggestions()`, `useSendAgentMessage()` → mutation `{ conversationId?, text }` → `SendMessageResponse` |
| `mcp.ts` | `useMcpSettings()`, `useRotateMcpKey()` (stores nothing client-side; returns the one-time key to the caller) |

- [ ] **Step 1: Failing tests (representative; write the full set for every export)**
```ts
it("useSummary requests the range and keys by it", async () => {
  const { result, rerender } = renderHookWithQuery(({ r }) => useSummary(r), { initialProps: { r: "30d" as const } });
  await waitFor(() => expect(result.current.data?.kpis.leads.value).toBe(10));
  mockApi({ "GET /api/v1/metrics/summary?range=90d": { ...summaryFixture, range: "90d" } });
  rerender({ r: "90d" as never }); await waitFor(() => expect(result.current.data?.range).toBe("90d"));
});
it("useToggleDone is optimistic and rolls back on failure", async () => {
  mockApi({ "POST /api/v1/next_actions/aaaaaaaa-0000-4000-8000-000000000007/text_back_now/completion": () => new Response("{}", { status: 500 }) });
  /* seed ["next_actions", undefined]; act(toggle); expect progress.done 1 then back to 0; toast called */
});
it("useSnapshotUpload walks idle → uploading → validating → review → committing → done by polling", async () => { /* upload 7 files; fake timers advance polls; progress.pct rises; then commit */ });
it("useSnapshotUpload resumes polling for a pending upload found in /snapshots/current (page reload mid-load)", async () => { /* ?mock=loading */ });
it("useSnapshotUpload stops polling on unmount and on terminal states", async () => { /* fetch count stable */ });
it("useSnapshotUpload surfaces 409 as already_in_progress", async () => { /* commit override 409 */ });
it("useLead is disabled for null", () => { /* fetch not called */ });
it("useLeadSearch ignores one-character queries and debounces", async () => { /* fake timers */ });
it("useInviteCoordinator exposes valid_names from ApiError.extra", async () => { /* 422 */ });
it("useCoordinator encodes spaces", async () => { /* 'Dana Ortiz' → Dana%20Ortiz */ });
```
- [ ] **Step 2:** FAIL; **Step 3:** implement each file (typed with `types.ts`; mutations through `jsonRequest`/`uploadFiles`); **Step 4:** `make web-test ARGS=app/javascript/api` → pass. Commit per file.

---

## Task 8: Conformance tests

**Files:** `app/javascript/mocks/conformance.test.ts`.
- [ ] **Step 1: Test**
```ts
import Ajv2020 from "ajv/dist/2020"; import addFormats from "ajv-formats"; import { readFileSync } from "node:fs"; import { parse } from "yaml";
const spec = parse(readFileSync(new URL("../../../contracts/dist/openapi.bundled.yaml", import.meta.url), "utf8"));
const ops = Object.entries(spec.paths).flatMap(([path, item]: any) => ["get","post","patch","delete"].filter((m) => item[m]).map((m) => ({ path, method: m, op: item[m] })));

it("has a mock handler for every operation (coverage)", async () => { /* for each op, request the path with sample params; response must not be MSW 'unhandled' (the server is configured onUnhandledRequest:'error') */ });
it.each(ops.filter(({ op }) => op.responses["200"] ?? op.responses["201"]))("$method $path default response matches its schema", async ({ path, method, op }) => {
  /* sign in as owner, build URL with sample params (range=30d, id/lead_id=L4 uuid, channel=Facebook, name=Dana%20Ortiz, token=abc, platform=meta, queue=text_back_now),
     call it, take the first 2xx status in the contract, validate JSON against op.responses[status].content["application/json"].schema with Ajv2020 + addFormats, expect valid */
});
```
(Add `yaml` dev dependency; run `make contract` before tests via the `pretest` npm script.) Operations with special request bodies (multipart upload, signup, invite) use canned bodies defined in a table at the top of the test.
- [ ] **Step 2:** run → fix any fixture/handler that fails validation (this is the point of the test). **Step 3:** `make web-test ARGS=app/javascript/mocks` → pass. Commit.

---

## Task 9: Mock-mode smoke, docs, finish

- [ ] **Step 1: e2e** `e2e/mock-smoke.spec.ts`: (Playwright `mock-*` projects against `npm run dev:mock`; **no Rails and no Docker running**) open `/` and assert the page loads without network errors (the app shell is not built yet: assert the MSW worker is active by `await page.evaluate(() => fetch("/api/v1/me").then(r => r.status))` → `401`, sign in via `fetch` POST `/api/v1/session` with `erin@harbor.test`, then `/api/v1/metrics/summary?range=30d` → `200` and `kpis.leads.value === 10`).
- [ ] **Step 2: Docs** — append to `contracts/README.md`: the CCR procedure (branch `ccr/<topic>`, only `contracts/**` + regenerated `schema.d.ts`, label `ccr`, add/adjust mock handler + hook in the same PR if the change affects them — in that case the PR is allowed to touch `app/javascript/api/**` and `app/javascript/mocks/**`).
- [ ] **Step 3: Acceptance** (from spec `2101`): run commands 1–4 and 6; paste output in the PR.
- [ ] **Step 4:** `make verify` → exit 0. Commit; open PR.

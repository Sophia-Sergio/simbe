# Owner Insights UI Implementation Plan

> **For Cursor / OpenCode:** Implement task-by-task. Follow `docs/conventions/` and **`docs/design/brand.md`** (colors, type, shapes, logo override the handoff). Stop if blocked — do not replan silently. Steps use checkbox (`- [ ]`) syntax. **Commit after every task** (`feat(insights-ui): task N – <title>`) after the task's tests + `npm run typecheck && npm run lint`.

**Goal:** Build This week, Funnel, Channels and Channel detail screens from the metrics API.

**Spec:** `docs/superpowers/specs/2026-10/2026-10-14-2006-owner-insights-ui-design.md`

**Depends on:** `2026-10-14-2001-foundation` (shell, tokens, `jsonRequest`, `Pill`, `Button`) and `2026-10-14-2005-metrics` merged. **Unblocks:** agent plan wires `openAgent`.

**Architecture:** Feature folder `src/features/insights/` with typed API hooks, presentational components (`KpiCard`, `Donut`, `BarRow`, `RecommendationCard`, `ChannelTable`…) and four route pages. `range` is URL state.

**Tech Stack:** React 18, TypeScript, TanStack Query, React Router, Tailwind (brand tokens), Vitest + Testing Library, Playwright.

## Global Constraints
- Layout per handoff §3–5; styling per `docs/design/brand.md`. Breakpoint 860px.
- All HTTP through `src/api/` + `jsonRequest`. No hardcoded hex outside `tailwind.config.ts`/`tokens.css`.
- Money arrives in cents; formatting is centralized in `src/lib/format.ts`.

## Review Focus
- `snapshot: null` → empty state linking to Data sources, no crash on `undefined` KPIs.
- `cost_per_qualified` null (no spend / no qualified) shows `—`, not `$0` or `NaN`.
- Delta `null` shows nothing (not `+0%`).
- Channel names with spaces or odd characters in the URL (`/channels/Facebook` encoded).
- Switching range while a request is in flight shows the new range's data only.

---

## File Map

| Action | Path |
|--------|------|
| Create | `frontend/src/lib/format.ts` (+test) |
| Create | `frontend/src/api/metrics.ts` (types + hooks, +test) |
| Create | `frontend/src/features/insights/{useRange.ts,AgentContext.tsx}` |
| Create | `frontend/src/features/insights/components/{RangeControl,KpiCard,Donut,BarRow,RecommendationCard,ChannelTile,EmptyInsights,Skeletons}.tsx` |
| Create | `frontend/src/features/insights/pages/{WeekPage,FunnelPage,ChannelsPage,ChannelPage}.tsx` |
| Modify | `frontend/src/routes/router.tsx` (replace ComingSoon for `/`, `/funnel`, `/channels`, `/channels/:channel`), `frontend/src/components/shell/TopBar.tsx` (Snapshot pill) |
| Create | `frontend/e2e/insights.spec.ts` |

---

## Task 1: Formatting and API hooks

**Files:** Create `src/lib/format.ts`, `src/lib/format.test.ts`, `src/api/metrics.ts`, `src/api/metrics.test.tsx`.
**Interfaces — Produces:**
```ts
export type Range = "30d" | "90d" | "12m";
export const formatMoney: (cents: number | null | undefined) => string;   // 28333 → "$283"; 4550 → "$45.50"; null → "—"
export const formatInt: (n: number | null | undefined) => string;          // 3530 → "3,530"
export const formatPct: (n: number | null | undefined, digits?: number) => string; // 14.1 → "14.1%"
export const formatDelta: (n: number | null | undefined, unit?: "%" | "pp") => { text: string; tone: "up" | "down" | "none" };
// metrics.ts
useSummary(range: Range); useFunnel(range); useChannels(range); useChannel(channel: string, range: Range); useRecommendations(range: Range)
```
and the response types mirroring the backend payloads (`Summary`, `Funnel`, `Channels`, `ChannelDetail`, `Recommendation`) exactly as in the metrics plan.

- [ ] **Step 1: Failing tests**
```ts
import { formatMoney, formatInt, formatPct, formatDelta } from "./format";
it("formats money", () => {
  expect(formatMoney(28333)).toBe("$283");
  expect(formatMoney(4550)).toBe("$45.50");
  expect(formatMoney(null)).toBe("—");
});
it("formats ints and pct", () => {
  expect(formatInt(3530)).toBe("3,530");
  expect(formatPct(14.14)).toBe("14.1%");
  expect(formatPct(null)).toBe("—");
});
it("formats deltas", () => {
  expect(formatDelta(6)).toEqual({ text: "+6%", tone: "up" });
  expect(formatDelta(-0.3, "pp")).toEqual({ text: "−0.3", tone: "down" });
  expect(formatDelta(null)).toEqual({ text: "", tone: "none" });
});
```
`metrics.test.tsx`: renders a hook under `QueryClientProvider` with `fetch` mocked; asserts it calls `/api/v1/metrics/summary?range=90d` and that the query key changes with range (second render with `12m` triggers a second fetch).
- [ ] **Step 2:** `make web-test ARGS=src/lib` → FAIL. **Step 3:** implement (`Intl.NumberFormat("en-US")`; money rounds to whole dollars at ≥ $100 else 2 decimals; deltas use the true minus sign `−`). Hooks use `useQuery({ queryKey: ["metrics","summary",range], queryFn: () => jsonRequest("GET", `/api/v1/metrics/summary?range=${range}`), staleTime: 60_000 })`, channel path uses `encodeURIComponent`.
- [ ] **Step 4:** pass; typecheck. Commit.

---

## Task 2: Range state, agent context, shared components

**Files:** Create `src/features/insights/{useRange.ts,AgentContext.tsx}`, components `RangeControl`, `KpiCard`, `Donut`, `BarRow`, `ChannelTile`, `RecommendationCard`, `EmptyInsights`, `Skeletons`, tests for each.

**Interfaces — Produces:**
- `useRange(): [Range, (r: Range) => void]` — reads/writes `?range=`; default `"30d"`; invalid values fall back to `"30d"`.
- `AgentProvider` / `useAgent(): { open(question?: string): void }` — no-op default (plan 07 replaces with the real panel); `open` records the last question for tests.
- `<RangeControl value onChange />` — segmented `30 days | 90 days | 12 months`, `rounded-full` track `bg-subtle`, white thumb with `shadow-card`.
- `<KpiCard label value delta? note? bar />` where `bar: { kind: "fill"; pct: number; tone?: "success" } | { kind: "thirds"; active: 0 | 1 | 2 }`; 6px high, `rounded-full`; value in `font-display` 28px; delta colored `text-success-text` (up) / `text-warning-text` (down).
- `<Donut pct label sublabel />` — 92px SVG ring, stroke 12, green base + warning arc proportional to `pct`, center text `font-display` 20px (`27% stall`).
- `<BarRow label value pct tone="dark|brand|success|danger|muted" />` — 10px track `bg-subtle`, `rounded-full` fill.
- `<ChannelTile channel size=28|36 />` — rounded-`logo` square, color from the channel map, initial letter.
- `<RecommendationCard rec onAsk onOpen />` — area pill (Process=warning, Ads=brand, People=violet), `impact` as muted text, title 15/600, why 13px secondary, `Open …` outline-brand button (rounded-full), `Ask why` ghost button with `Sparkles` icon.

- [ ] **Step 1: Failing tests** (examples; write the full set):
```tsx
it("KpiCard renders value, delta and note, and hides empty delta", () => {
  render(<KpiCard label="Leads" value="3,530" delta={{ text: "+6%", tone: "up" }} note="30 days" bar={{ kind: "fill", pct: 60 }} />);
  expect(screen.getByText("3,530")).toBeInTheDocument();
  expect(screen.getByText("+6%")).toHaveClass("text-success-text");
  render(<KpiCard label="X" value="—" delta={{ text: "", tone: "none" }} bar={{ kind: "fill", pct: 0 }} />);
  expect(screen.queryByText("+0%")).toBeNull();
});
it("RangeControl calls onChange", async () => {
  const onChange = vi.fn(); render(<RangeControl value="30d" onChange={onChange} />);
  await userEvent.click(screen.getByRole("button", { name: "12 months" }));
  expect(onChange).toHaveBeenCalledWith("12m");
});
it("RecommendationCard sends the preset question to the agent", async () => {
  const onAsk = vi.fn(); render(<RecommendationCard rec={fixtureRec} onAsk={onAsk} onOpen={vi.fn()} />);
  await userEvent.click(screen.getByRole("button", { name: /ask why/i }));
  expect(onAsk).toHaveBeenCalledWith(fixtureRec.ask.question);
});
it("Donut exposes a text alternative", () => {
  render(<Donut pct={27} label="27% stall" sublabel="stall" />);
  expect(screen.getByRole("img", { name: /27% stall/ })).toBeInTheDocument();
});
it("useRange falls back to 30d for junk values", () => { /* MemoryRouter initialEntries ["/?range=zzz"] → "30d" */ });
```
- [ ] **Step 2:** FAIL; **Step 3:** implement with brand tokens only (class names, no raw hex except the channel-tile map in `ChannelTile.tsx`, documented as placeholders); **Step 4:** `make web-test ARGS=src/features/insights/components` → pass; typecheck/lint. Commit.

---

## Task 3: This week page

**Files:** Create `pages/WeekPage.tsx`, `pages/WeekPage.test.tsx`; Modify `router.tsx` (`/` → owner: WeekPage; coordinator: `<Navigate to="/next-actions" />`), `TopBar.tsx` (Snapshot pill from `GET /api/v1/snapshots/current` → `Snapshot Oct 1` formatted in the agency tz; hidden when null).

- [ ] **Step 1: Failing page test** (mock `fetch` by URL; Alpha-like payloads):
```tsx
it("renders greeting, four KPIs, recommendations and leak", async () => {
  mockApi({
    "/api/v1/metrics/summary?range=30d": summaryFixture,        // leads 10, qualified 3, rate 30, cpq 28333
    "/api/v1/recommendations?range=30d": [leakRec, noShowRec],
    "/api/v1/me": ownerErin,
  });
  renderWithProviders(<WeekPage />, { route: "/" });
  expect(await screen.findByText(/Good (morning|afternoon|evening), Erin/)).toBeInTheDocument();
  expect(screen.getByText("Leads")).toBeInTheDocument();
  expect(screen.getByText("30.0%")).toBeInTheDocument();
  expect(screen.getByText("$283")).toBeInTheDocument();
  expect(screen.getByText("2 things worth your time", { exact: false })).toBeInTheDocument();
  expect(screen.getByText("50% stall")).toBeInTheDocument();
});
it("shows the empty state without a snapshot", async () => {
  mockApi({ "/api/v1/metrics/summary?range=30d": { ...summaryFixture, snapshot: null }, "/api/v1/recommendations?range=30d": [] });
  renderWithProviders(<WeekPage />);
  expect(await screen.findByRole("link", { name: /load your data/i })).toHaveAttribute("href", "/data");
});
it("switching range refetches", async () => { /* click 90 days; expect fetch called with range=90d */ });
it("CTA navigates with the range preserved", async () => { /* click Open funnel → location /funnel?range=30d */ });
it("shows 'sample' next to cost when spend is sample", async () => { /* spend_source 'sample' */ });
```
- [ ] **Step 2:** FAIL; **Step 3:** implement. KPI bar rules: leads `fill` = `value / max(value, previous || value) * 100`; qualified `fill` = `qualified/leads*100`; rate `fill` = rate; cost `thirds` active = 0 if cost ≤ best channel cost × 1.15, 2 if ≥ worst × 0.85, else 1 (all-green when only one channel). Notes: Leads `<range label>`, Qualified `<definition label>` ("Attended a consult" etc. from `agency.qualified_milestone`), Rate "Recent leads still maturing", Cost "Paid spend $X" (+ muted `sample`). Grid: `grid-cols-2 md:grid-cols-4 gap-3`; body `md:grid-cols-[1.6fr_1fr]`. Right-column cost bars use `BarRow` tones (best success, worst danger, others muted).
- [ ] **Step 4:** `make web-test ARGS=src/features/insights/pages/WeekPage` → pass. **Step 5 (visual):** `make up`, load Harbor (`snapshot:load` + `spend:sample`), open `/`, compare against `design_handoff_simbe/screenshots/04-owner-this-week.png` at 1280px and 390px. Commit.

---

## Task 4: Funnel page

**Files:** Create `pages/FunnelPage.tsx`, `FunnelPage.test.tsx`.

- [ ] **Step 1: Failing test** (Alpha funnel payload):
```tsx
it("renders six rows with counts, percentages and the qualified row flagged", async () => {
  mockApi({ "/api/v1/metrics/funnel?range=30d": funnelFixture });
  renderWithProviders(<FunnelPage />);
  expect(await screen.findByText("10 leads")).toBeInTheDocument();
  for (const [name, count] of [["Inquiry","10"],["Application","5"],["Consult booked","4"],["Attended consult","3"],["Records","2"],["Accepted","1"]])
    expect(screen.getByText(name)).toBeInTheDocument();
  expect(screen.getByText("50% of previous", { exact: false })).toBeInTheDocument();
  expect(screen.getByText("Attended consult")).toHaveClass("text-brand-text");
  expect(screen.getByText(/Qualified = attended a consult/i)).toBeInTheDocument();
});
it("builds the exit line from the next row's drop and top reasons", async () => {
  /* Inquiry row text: '50% leave here · age, bmi' */
});
it("renders form drop-off bars with the highest in warning", async () => { /* pregnancy_history 100% */ });
```
- [ ] **Step 2:** FAIL; **Step 3:** implement. Definition labels: `application_submitted → "submitted an application"`, `consult_attended → "attended a consult"`, `records → "reached medical records"`, `accepted → "been accepted"`. Bar tone: rows before the qualified row `dark`, the qualified row `brand`, after `success`. Section names → human labels by replacing `_` with space and capitalizing.
- [ ] **Step 4:** pass. Visual check against `05-funnel.png`. Commit.

---

## Task 5: Channels and Channel detail

**Files:** Create `pages/ChannelsPage.tsx`, `pages/ChannelPage.tsx`, tests; Modify `router.tsx`.

- [ ] **Step 1: Failing tests**
```tsx
it("lists channels with flags and navigates to detail", async () => {
  mockApi({ "/api/v1/metrics/channels?range=30d": channelsFixture });
  renderWithProviders(<ChannelsPage />);
  const row = await screen.findByRole("row", { name: /Facebook/ });
  expect(within(row).getByText("$150")).toHaveClass("bg-success-bg");
  expect(within(row).getByText("66.7%")).toBeInTheDocument();
  await userEvent.click(row);
  expect(window.location.pathname).toBe("/channels/Facebook");
});
it("shows the ranked-by-rate note when basis is rate", async () => { /* basis: "rate" */ });
it("renders the two insight cards", async () => { /* '10% of leads have no source', '… outside your main states' */ });
it("channel detail shows KPIs, campaigns and the Ask Simbe button", async () => {
  mockApi({ "/api/v1/metrics/channels/Facebook?range=30d": detailFixture });
  renderWithProviders(<ChannelPage />, { route: "/channels/Facebook", path: "/channels/:channel" });
  expect(await screen.findByText("c-a")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: /ask simbe/i }));
  expect(agentSpy).toHaveBeenCalledWith(expect.stringMatching(/Facebook/));
});
it("renders a not-found state for an unknown channel", async () => { /* 404 → 'We couldn't find that channel' + link back */ });
```
- [ ] **Step 2:** FAIL; **Step 3:** implement (table semantic `<table>` with `role="row"`; mobile `<md` stacked cards). `Ask Simbe` question: `"How is ${channel} performing and what should I change?"`.
- [ ] **Step 4:** pass. Visual check against `06-channels.png`, `07-channel-detail.png`. Commit.

---

## Task 6: E2E, screenshots, polish

**Files:** Create `frontend/e2e/insights.spec.ts`; Modify seed script for e2e (`backend/lib/tasks/e2e.rake`: `rake e2e:seed` loads Alpha from `spec/support` into a `harbor` agency + `AlphaSpend`).

- [ ] **Step 1:** Playwright test signs in as `erin@harbor.test`, visits `/`, `/funnel`, `/channels`, `/channels/Facebook` at 1280×800 and 390×844, asserts key text (`Good`, `10 leads`, `Facebook`, `Campaigns`) and writes `e2e/screenshots/{week,funnel,channels,channel}-{desktop,mobile}.png`.
- [ ] **Step 2:** `docker compose exec api bundle exec rails e2e:seed && make e2e ARGS=insights` → pass.
- [ ] **Step 3:** Review screenshots against handoff 04–07 (layout) and `docs/design/brand.md` (colors, shapes, logo). Fix gaps in the same task.
- [ ] **Step 4:** `make verify` → exit 0. Commit; open PR.

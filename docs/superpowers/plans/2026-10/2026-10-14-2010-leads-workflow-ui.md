# Leads Workflow — UI Implementation Plan

> **Detail reference, not executed directly.** The work in this plan is sliced into parallel lanes — see [`docs/superpowers/parallel/README.md`](../../parallel/README.md). Lane plans execute specific tasks of this plan with explicit overrides (data via `AlphaScenario.load!`, hooks/kit/shell from Wave 0, routes via per-lane files, contract paths per `contracts/openapi`). Where this plan differs from a lane plan or the contract, **the lane plan and `contracts/` win**.

> **For Cursor / OpenCode:** Implement task-by-task. Follow `docs/conventions/` and **`docs/design/brand.md`** (colors, type, shapes, logo override the handoff). Layout/behavior: `design_handoff_simbe/README.md` §6–9 and screenshots `08`–`11`, `16`. Stop if blocked — do not replan silently. **Commit after every task** (`feat(leads-ui): task N – <title>`) after the task's tests + typecheck + lint.

**Goal:** Pipeline board/list, lead slide-over panel, coordinator Next actions, Coordinators screens and the ⌘K search palette.

**Spec:** `docs/superpowers/specs/2026-10/2026-10-14-2008-leads-workflow-design.md`

**Depends on:** `2026-10-14-2001-foundation` (shell, `Sheet`, `Toast`, `useAsyncAction`) and `2026-10-14-2009-leads-workflow-api` merged. (Insights UI plan is independent.) **Unblocks:** agent plan (navigation actions open the lead panel).

**Architecture:** `src/features/leads/` — typed API hooks, a URL-driven lead panel (`?lead=<id>&tab=summary`), page components per route, shared `LeadCard`, `ProgressBar`, `StatusPill`, `Ring`. Role gating is cosmetic; the API enforces it.

**Tech Stack:** React 18 + TS, TanStack Query (optimistic updates), React Router, Tailwind (brand tokens), Vitest/Testing Library, Playwright.

## Global Constraints
- Breakpoint 860px: mobile board = one column with chips; panel and agent full screen; modals bottom sheets.
- Raw screener answers render **only** when the API includes `answer` (never infer). Phone is shown exactly as returned (masked unless the API says otherwise).
- Mutations (Done, Undo) go through `useAsyncAction`; no native dialogs.
- Esc closes the panel; Prev/Next cycles the ids of the list currently on screen.

## Review Focus
- Lead panel opened by URL for a lead outside the user's scope → 404 state ("This lead isn't available") and no flash of another lead's data.
- Done toggle fails (network/409) → optimistic change rolls back and a toast explains.
- Leads with no application/appointment/contacts render blank-safe sections.
- Very long names / missing first or last name don't break card layout.
- Coordinator typing `/pipeline` as owner-only URLs (`/coordinators`) → redirected to `/next-actions`.

---

## File Map

| Action | Path |
|--------|------|
| Create | `frontend/src/api/leads.ts` (+test) |
| Create | `frontend/src/features/leads/components/{LeadCard,ProgressBar,StatusPill,Ring,SourcePill,ColumnChips,TaskCard}.tsx` |
| Create | `frontend/src/features/leads/panel/{LeadPanel,SummaryTab,ScreenerTab,ActivityTab,SourceTab,useLeadPanel}.tsx` |
| Create | `frontend/src/features/leads/pages/{PipelinePage,NextActionsPage,CoordinatorsPage,CoordinatorPage}.tsx` |
| Create | `frontend/src/features/leads/search/SearchPalette.tsx` |
| Modify | `frontend/src/routes/router.tsx`, `frontend/src/components/shell/{Sidebar,TopBar,MobileTabBar,nav}.tsx` (count pills, search button) |
| Create | `frontend/e2e/leads.spec.ts` |

---

## Task 1: API hooks

**Files:** Create `src/api/leads.ts`, `src/api/leads.test.tsx`.
**Interfaces — Produces:** types `LeadCard`, `LeadDetail`, `Board`, `NextActions`, `CoordinatorRow` (mirroring the API plan exactly) and hooks `useBoard(coordinator?)`, `useLeadList({status,coordinator,q})` (infinite query on `next_cursor`), `useLead(id)`, `useNextActions(coordinator?)`, `useToggleDone()` → `{ toggle(lead_id, queue, done) }`, `useCoordinators()`, `useCoordinator(name)`, `useLeadSearch(q)` (enabled when `q.length ≥ 2`, debounced 200 ms).
`useToggleDone` does optimistic update of `["next_actions"]`: flips the item's `done`, adjusts the queue `count` and `progress.done`; on error restores the snapshot and calls `toast.show("Couldn't save — try again")`.

- [ ] **Step 1: Failing tests**
```tsx
it("optimistically marks an item done and rolls back on failure", async () => {
  const { result, qc } = renderHookWithQuery(() => useToggleDone(), { seed: { ["next_actions", undefined]: nextActionsFixture } });
  mockFetch.mockRejectedValueOnce(new ApiError(500, "boom", "boom"));
  await act(async () => { await result.current.toggle("lead-7", "text_back_now", true); });
  expect(qc.getQueryData(["next_actions", undefined]).progress.done).toBe(0); // rolled back
  expect(toastShow).toHaveBeenCalledWith("Couldn't save — try again");
});
it("search is disabled for one character", () => { /* useLeadSearch('a') does not fetch */ });
it("encodes coordinator names in /coordinators/:name", async () => { /* 'Dana Ortiz' → Dana%20Ortiz */ });
```
- [ ] **Step 2:** FAIL; **Step 3:** implement; **Step 4:** `make web-test ARGS=src/api/leads` → pass. Commit.

---

## Task 2: Shared components

**Files:** Create `LeadCard`, `ProgressBar`, `StatusPill`, `Ring`, `SourcePill`, `ColumnChips`, `TaskCard` + tests.
**Interfaces — Produces:**
- `ProgressBar({ segments: ("done"|"action"|"closed"|"current"|"todo")[] })` — six 5px-high segments, 2px gaps, `rounded-full`; colors: done/current `bg-success`, action `bg-warning`, closed `bg-danger`, todo `bg-subtle` (`border-line` when needed for contrast).
- `StatusPill({ status: { key, label, tone } })` — `Pill` tones (danger/warning/success/neutral/violet).
- `SourcePill({ channel })` — small pill with channel color dot.
- `LeadCard({ lead, onOpen })` — white `rounded-card`, 12px padding, hover `border-line-strong shadow-cardhover`; line 1 name (600) + source pill + status pill; line 2 `"29 yrs | CA"` (omit missing parts) and date `Oct 1` right-aligned in the agency tz; line 3 `ProgressBar`. Whole card is a `button`.
- `Ring({ met, review, notMet, unanswered })` — 84px SVG donut (segments success / warning / danger / `line`), center `"<pct>%"` + `"Progress"` where pct = `round(met / total * 100)`; legend `N met · N red flags · N to review · N unanswered`.
- `ColumnChips({ columns, value, onChange })` (mobile).
- `TaskCard({ item, onOpen, onToggle, pending })` — name, age right (`38m`), reason, `Text`/`Call` outline-brand button (only when `canContact`), `Done`/`Undo` button; done → `opacity-50` and green `Undo`.

- [ ] **Step 1: Failing tests** (full set; examples):
```tsx
it("ProgressBar colors segments by state", () => {
  render(<ProgressBar segments={["done","done","action","todo","todo","todo"]} />);
  const segs = screen.getAllByTestId("segment");
  expect(segs.map(s => s.dataset.state)).toEqual(["done","done","action","todo","todo","todo"]);
  expect(segs[2]).toHaveClass("bg-warning");
});
it("LeadCard omits missing age/state cleanly and opens on click", async () => {
  const onOpen = vi.fn();
  render(<LeadCard lead={{ ...leadFixture, age: null, state: "CA" }} onOpen={onOpen} />);
  expect(screen.getByText("CA")).toBeInTheDocument();
  expect(screen.queryByText(/yrs/)).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: /L4 Alpha/ }));
  expect(onOpen).toHaveBeenCalledWith(leadFixture.id);
});
it("Ring prints the legend", () => {
  render(<Ring met={7} review={1} notMet={1} unanswered={1} />);
  expect(screen.getByText("7 met · 1 red flags · 1 to review · 1 unanswered")).toBeInTheDocument();
  expect(screen.getByText("70%")).toBeInTheDocument();
});
it("TaskCard done state and button label", async () => { /* done → 'Undo', opacity-50; click calls onToggle(false) */ });
it("TaskCard hides Text/Call when canContact is false", () => { /* ... */ });
```
- [ ] **Step 2:** FAIL; **Step 3:** implement; **Step 4:** `make web-test ARGS=src/features/leads/components` → pass. Commit.

---

## Task 3: Pipeline page (board + list)

**Files:** Create `pages/PipelinePage.tsx`, `PipelinePage.test.tsx`; Modify `router.tsx` (`/pipeline`).

- [ ] **Step 1: Failing tests**
```tsx
it("renders the four board columns with counts", async () => {
  mockApi({ "/api/v1/leads?view=board": boardFixture }); // action_needed 4, in_application 0, consult 0, qualified 3
  renderWithProviders(<PipelinePage />, { role: "owner" });
  for (const [name, n] of [["Action needed","4"],["In application","0"],["Consult","0"],["Qualified","3"]])
    expect(await screen.findByRole("region", { name })).toHaveTextContent(n);
});
it("switches to list view and filters", async () => { /* click 'List'; type 'l4' → request has q=l4; shows only L4 */ });
it("owner sees the coordinator dropdown, coordinator does not", async () => { /* role owner vs coordinator */ });
it("mobile shows chips and one column at a time", async () => { setViewport(390); /* click 'Qualified' chip → only qualified cards visible */ });
it("opens the lead panel from a card via ?lead=", async () => { /* click card → location.search includes lead=<id> */ });
it("shows an empty column hint", async () => { /* '0' column shows 'Nothing here' */ });
```
- [ ] **Step 2:** FAIL; **Step 3:** implement per handoff §6: header (title + count pill = total board leads), toolbar (Board/List segmented, owner-only "All coordinators" select), 4 `bg-subtle rounded-panel` wells with header count pills, list view rows (name, source pill, status pill, `age · stage`, coordinator) with a status filter (`Open`, `All`, `Closed`, `Paused`, `Accepted`) and "Load more" (infinite). Register the visible lead ids with `useLeadPanel().setIds(ids)` for Prev/Next.
- [ ] **Step 4:** pass. Visual check vs `08-pipeline-board.png`. Commit.

---

## Task 4: Lead panel

**Files:** Create `panel/{LeadPanel,SummaryTab,ScreenerTab,ActivityTab,SourceTab,useLeadPanel}.tsx`, tests; Modify `AppShell` to mount `<LeadPanel />` once (reads `?lead=`).
**Interfaces — Produces:** `useLeadPanel(): { leadId, tab, open(id, tab?), close(), setIds(ids), prev(), next() }` backed by URL search params (`lead`, `tab` ∈ `summary|screener|activity|source`; invalid tab → `summary`).

- [ ] **Step 1: Failing tests**
```tsx
it("shows header, contact, screener ring and consult for a lead", async () => {
  mockApi({ "/api/v1/leads/lead-4": leadDetailFixture });
  renderWithProviders(<LeadPanel />, { route: "/pipeline?lead=lead-4" });
  expect(await screen.findByText("L4 Alpha")).toBeInTheDocument();
  expect(screen.getByText("Dana Ortiz")).toBeInTheDocument();
  expect(screen.getByText(/10 met/)).toBeInTheDocument();
});
it("owner sees verdict pills but never raw answers", async () => {
  renderWithProviders(<LeadPanel />, { route: "/pipeline?lead=lead-4&tab=screener" });
  expect(await screen.findAllByText("Met")).toHaveLength(10);
  expect(screen.queryByTestId("raw-answer")).toBeNull();
  expect(screen.getByText(/visible to the assigned coordinator only/i)).toBeInTheDocument();
});
it("assigned coordinator sees raw answers", async () => { /* detail fixture with answer → data-testid raw-answer present */ });
it("enables Send text / Call / Mark done only when can_contact", async () => { /* can_contact false → buttons absent */ });
it("Send text links to sms: and Call to tel: with the unmasked number", async () => { /* href */ });
it("tabs switch and persist in the URL", async () => { /* click Activity → ?tab=activity */ });
it("Esc closes, Prev/Next cycles ids, scrim click closes", async () => { /* ids [a,b,c] on b */ });
it("renders a not-available state on 404", async () => { /* 404 → "This lead isn't available" */ });
it("Mark done toggles through the completion API and turns green", async () => { /* POST/DELETE */ });
it("Book consult is disabled with an explanatory title", () => { /* aria-disabled + title 'Booking integration not connected' */ });
```
- [ ] **Step 2:** FAIL; **Step 3:** implement per handoff §7 with brand shapes: `Sheet` 620px (full-screen under 860px), header (name `font-display` 17px, coordinator + user icon, "Stage · Status" subline, Prev/Next/Close — icon-only on mobile), action row (Send text outline-brand, Call secondary, Mark done, Actions ▾ menu), top grid (Contact / Screener Ring / Consult cards; stacked on mobile), segmented tabs. Summary: Process card with state icons (complete green ✓, ongoing brand ring, stopped red, upcoming grey ring) + "Simbe summary" card (`bg-app`, Sparkles icon, `summary.text`, "Suggested next step: …"). Activity: vertical timeline, newest first, newest dot `bg-brand`, others grey. Source: key/value rows (Channel, Campaign, Ad, First visit, Pages viewed, Self-reported → "Not collected"). Slide-in 200 ms ease-out from `translateX(24px)`.
- [ ] **Step 4:** `make web-test ARGS=src/features/leads/panel` → pass. Visual check vs `09-lead-panel-summary.png`, `10-lead-panel-screener.png`. Commit.

---

## Task 5: Next actions (coordinator home)

**Files:** Create `pages/NextActionsPage.tsx`, test; Modify `router.tsx` (`/next-actions`; coordinator `/` redirects here), nav count pill.

- [ ] **Step 1: Failing tests**
```tsx
it("renders four queues with hints and the progress card", async () => {
  mockApi({ "/api/v1/next_actions": nextActionsFixture }); // counts 1/1/1/1, progress 0/4
  renderWithProviders(<NextActionsPage />, { role: "coordinator" });
  expect(await screen.findByText("Text back now")).toBeInTheDocument();
  expect(screen.getByText("New leads, no message sent yet")).toBeInTheDocument();
  expect(screen.getByText("0 / 4")).toBeInTheDocument();
  expect(screen.getByText("4 open", { exact: false })).toBeInTheDocument();
});
it("Done updates counts and progress immediately and Undo reverts", async () => {
  /* click Done on L7: queue count 0, progress '1 / 4', header '3 open', card opacity-50, button 'Undo' */
});
it("clicking the card body opens the lead panel", async () => { /* ?lead= */ });
it("shows 'You're all caught up' when everything is done", async () => { /* progress 4/4 */ });
```
- [ ] **Step 2:** FAIL; **Step 3:** implement per handoff §9: header "Next actions" + open-count pill + subtitle `<weekday Month D> · most urgent first` from `as_of` in the agency tz, "Today's progress" card (`N / M` + green bar), 4 queue wells (colored dot: danger/warning/violet/grey, title, count pill, hint), `TaskCard`s. Nav: "Next actions" shows total open count pill.
- [ ] **Step 4:** pass. Visual check vs `16-coordinator-next-actions.png`. Commit.

---

## Task 6: Coordinators (owner) and detail

**Files:** Create `pages/CoordinatorsPage.tsx`, `pages/CoordinatorPage.tsx`, tests; Modify `router.tsx` (`/coordinators`, `/coordinators/:name` with owner guard).

- [ ] **Step 1: Failing tests**
```tsx
it("renders person cards with stats and status pills", async () => {
  mockApi({ "/api/v1/coordinators": coordinatorsFixture }); // Dana needs_support, Jess on_track
  renderWithProviders(<CoordinatorsPage />, { role: "owner" });
  expect(await screen.findByText("Dana Ortiz")).toBeInTheDocument();
  expect(screen.getByText("Needs support")).toBeInTheDocument();
  expect(screen.getByText("On track")).toBeInTheDocument();
  expect(screen.getByText(/Owner only/)).toBeInTheDocument();
  expect(screen.getByText(/can reflect lead mix as well as effort/i)).toBeInTheDocument();
});
it("detail shows KPIs and opens a lead panel from the needs-action list", async () => { /* click row → ?lead= */ });
it("redirects coordinators to /next-actions", async () => { /* role coordinator → location /next-actions */ });
it("formats first reply minutes as '23m' / '2h 10m'", () => { /* formatDuration */ });
```
- [ ] **Step 2:** FAIL; **Step 3:** implement per handoff §8: header (title, "Owner only" brand pill, "Sample figures" note only when spend is sample — omit here; the footnote text is mandatory), auto-fill grid `minmax(260px, 1fr)`, card: avatar (initials, `rounded-full`), name, `N leads · X% of leads`, status pill, 3 stats (First reply, Qualified %, Overdue). Detail: back link, avatar + name, 4 KPIs, "Leads needing action" list (rows open the lead panel).
- [ ] **Step 4:** pass. Visual check vs `11-coordinators.png`. Commit.

---

## Task 7: ⌘K search palette and nav polish

**Files:** Create `search/SearchPalette.tsx`, test; Modify `TopBar.tsx` (search button opens it), `Sidebar.tsx` (Pipeline count pill = board `action_needed` count; coordinator "My leads" → `/pipeline`).

- [ ] **Step 1: Failing tests**
```tsx
it("opens with Ctrl/Cmd+K, searches after 2 characters and opens the lead", async () => {
  renderWithProviders(<AppShell />, { role: "owner" });
  await userEvent.keyboard("{Control>}k{/Control}");
  await userEvent.type(screen.getByRole("combobox"), "l4");
  expect(await screen.findByRole("option", { name: /L4 Alpha/ })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("option", { name: /L4 Alpha/ }));
  expect(window.location.search).toContain("lead=");
});
it("Esc closes and arrow keys move the active option", async () => { /* ... */ });
it("shows 'No matches' for an empty result", async () => { /* ... */ });
```
- [ ] **Step 2:** FAIL; **Step 3:** implement as a `Modal` (max 480px, `rounded-modal`, never stacked over the lead panel: opening search closes the panel); results list max 8 with name, channel pill, status pill.
- [ ] **Step 4:** pass. Commit.

---

## Task 8: E2E, screenshots, final verification

**Files:** Create `frontend/e2e/leads.spec.ts`; extend `e2e:seed` (backend rake from the insights plan) to also create Alpha coordinators `dana@alpha.test` (coordinator_name `Dana Ortiz`) and owner `owner@alpha.test`.

- [ ] **Step 1:** Playwright flows:
  1. Coordinator `dana@alpha.test`: lands on `/next-actions`, sees 3 items, opens L4, clicks Mark done, count/progress update, panel shows no raw answers for a lead she is *not* assigned (navigate by URL → "isn't available").
  2. Owner: Pipeline → card → Screener tab shows 10 `Met` pills and no raw-answer elements; Coordinators page lists 4; ⌘K finds a lead.
  3. Screenshots at 1280×800 and 390×844 for pipeline, lead-panel, next-actions, coordinators.
- [ ] **Step 2:** `docker compose exec api bundle exec rails e2e:seed && make e2e ARGS=leads` → pass.
- [ ] **Step 3:** Compare screenshots with handoff `08`–`11`, `16` (layout) and `docs/design/brand.md` (colors/shapes/logo). Fix gaps.
- [ ] **Step 4:** `make verify` → exit 0. Commit; open PR.

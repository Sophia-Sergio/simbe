# Lane F-PIPELINE — Pipeline board and list

> **For Cursor / OpenCode:** Work only inside this lane's `Owns` list and follow the **frontend lane rules** in `docs/superpowers/parallel/README.md#frontend-lane-rules` (binding). Follow `docs/conventions/` and **`docs/design/brand.md`**. **Commit after every task** (`feat(f-pipeline): task N – <title>`).

**Lane:** F-PIPELINE · **Wave:** 1 (frontend, mock API)
**Owns:** `app/javascript/features/pipeline/**`, `e2e/pipeline.spec.ts`
**Depends on (merged):** Wave 0
**Hooks consumed:** `useBoard(coordinator?)`, `useLeadList({status, coordinator, q})`, `useCoordinatorNames()` (owner dropdown) from `@/api/hooks/{leads,account}`; `useLeadPanel()` (`open`, `setIds`); `useAuth()`
**Kit consumed:** `ProgressBar`, `StatusPill`, `SourcePill`, `Segmented`, `Chip`, `Select`, `Pill`, `Input`, `Skeleton`, `EmptyState`, `ErrorState`, `Button`
**Contract operations:** `getBoard`, `listLeads`
**Spec:** `docs/superpowers/specs/2026-10/2026-10-14-2008-leads-workflow-design.md` (decisions 1, 3, 4, 11)
**Detail reference:** `plans/2026-10/2026-10-14-2010-leads-workflow-ui.md` **Task 3 (Pipeline page)** and the `LeadCard` + `ColumnChips` components from its Task 2 (feature-specific; live here). **Skip** Tasks 1 (hooks), the kit components in Task 2, and Tasks 4–8.

## Feature registration (`app/javascript/features/pipeline/feature.ts`)
```ts
export const feature: FeatureModule = {
  id: "pipeline",
  routes: [{ path: "pipeline", element: <PipelinePage />, handle: { roles: ["owner", "coordinator"], title: "Pipeline" } }],
  nav: [
    { id: "pipeline", label: "Pipeline", icon: Kanban, section: "operations", roles: ["owner"], order: 40, to: "/pipeline",
      useBadge: () => useBoard().data?.columns.action_needed.count, mobile: { tab: { order: 2 } } },
    { id: "my-leads", label: "My leads", icon: UserCheck, section: "today", roles: ["coordinator"], order: 20, to: "/pipeline",
      mobile: { tab: { order: 2 } } },
  ],
};
```

## Overrides
1. Hooks from Wave 0; the lead panel is opened with `useLeadPanel().open(id)` and the visible ids registered with `setIds` (the panel itself is lane F-LEADPANEL's overlay; in this lane's tests assert the URL `?lead=<id>`).
2. Coordinator sessions never render the "All coordinators" dropdown; the API already scopes the data.
3. Contract: board is `GET /leads/board` (`getBoard`), list is `GET /leads` with `status` filter (`open` default, `all`, `closed`, `paused`, `accepted`) and `q`; "Load more" uses `next_cursor`.
4. Fixtures `contracts/examples/leads/board.json` (action_needed 4, in_application 0, consult 0, qualified 3) and `list.json`.
- **Loading state (async uploads):** when the data is empty *and* `useCurrentSnapshot().data?.pending` is non-null, render `<LoadingYourData progress={pending.progress} />` instead of the empty state; when there is no snapshot and nothing pending, the owner gets the "Load your data" link to `/data` (coordinators: "Ask your agency owner to load data"). Test both with `?mock=loading` and `?mock=empty`.

## Responsive acceptance
- **Desktop:** header (title + count pill), toolbar card (Board/List segmented, owner dropdown), four `bg-subtle rounded-panel` column wells with count pills; lead cards `rounded-card` with name + source/status pills, `28 yrs | CA` + date, 6-segment progress bar.
- **Mobile:** column **chips** with counts switch one column at a time; list rows stack name/pills/meta; tap opens the full-screen lead panel; no horizontal scroll.

## Done when (acceptance commands)
```bash
make web-test ARGS=app/javascript/features/pipeline
make e2e ARGS=pipeline             # pipeline-{desktop,mobile}.png
grep -rnE '#[0-9a-fA-F]{6}' app/javascript/features/pipeline | wc -l      # 0
docker compose exec web npm run typecheck && docker compose exec web npm run lint
make verify
```
`e2e/pipeline.spec.ts`: owner → four wells with counts `4/0/0/3`; clicking a card sets `?lead=…`; List view filters with `l4`; mobile shows chips and one column; coordinator (Dana) sees no coordinator dropdown and only her cards. Compare with `handoff/design/screenshots/08-pipeline-board.png`. Branch `lane/F-PIPELINE-<slug>`; `bin/pr-ownership`; paste outputs in the PR.

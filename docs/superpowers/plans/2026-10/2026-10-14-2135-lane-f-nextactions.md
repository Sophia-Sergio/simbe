# Lane F-NEXTACTIONS — Coordinator "Next actions"

> **For Cursor / OpenCode:** Work only inside this lane's `Owns` list and follow the **frontend lane rules** in `docs/superpowers/parallel/README.md#frontend-lane-rules` (binding). Follow `docs/conventions/` and **`docs/design/brand.md`**. **Commit after every task** (`feat(f-nextactions): task N – <title>`).

**Lane:** F-NEXTACTIONS · **Wave:** 1 (frontend, mock API)
**Owns:** `frontend/src/features/next-actions/**`, `frontend/e2e/next-actions.spec.ts`
**Depends on (merged):** Wave 0
**Hooks consumed:** `useNextActions(coordinator?)`, `useToggleDone()` (`@/api/hooks/nextActions`), `useLeadPanel().open`, `useAuth()`
**Kit consumed:** `Pill`, `Button`, `SegmentBar`, `Skeleton`, `EmptyState`, `ErrorState`, `Chip`, `formatDate`
**Contract operations:** `getNextActions`, `completeNextAction`, `undoNextAction`
**Spec:** `docs/superpowers/specs/2026-10/2026-10-14-2008-leads-workflow-design.md` (decisions 2, 7, 8)
**Detail reference:** `plans/2026-10/2026-10-14-2010-leads-workflow-ui.md` **Task 5 (Next actions)** and the `TaskCard` component from its Task 2 (feature-specific; lives here). Skip the rest.

## Feature registration (`src/features/next-actions/feature.ts`)
```ts
export const feature: FeatureModule = {
  id: "next-actions",
  routes: [{ path: "next-actions", element: <NextActionsPage />, handle: { roles: ["coordinator"], title: "Next actions" } }],
  nav: [{ id: "next-actions", label: "Next actions", icon: CheckSquare, section: "today", roles: ["coordinator"], order: 10, to: "/next-actions",
          useBadge: () => { const d = useNextActions().data; return d ? d.progress.total - d.progress.done : undefined; },
          mobile: { tab: { order: 1 } } }],
};
```

## Overrides
1. Optimistic Done/Undo comes from `useToggleDone` (Wave 0); this lane only wires the UI, the header open count (`progress.total − progress.done`), the progress card (`N / M` + green bar) and queue counts (`queue.count`).
2. `canContact` for the Text/Call buttons: tasks belong to the signed-in coordinator, so show **Text** (`sms:` link needs a phone — the API list doesn't include one, so the button opens the lead panel on the Summary tab instead). Clicking the card body also opens the panel.
3. Subtitle `<weekday Month D> · most urgent first` formatted from `as_of` in the agency time zone.
4. Fixture `contracts/examples/next-actions/next-actions.json` (four queues, counts 1/1/1/1, progress 0/4); a coordinator session in the mock shows only Dana's three items (L4, L3, L10).
5. "You're all caught up" empty state when `progress.done === progress.total && total > 0`; empty-queue wells show a muted "Nothing here".
- **Loading state (async uploads):** when the data is empty *and* `useCurrentSnapshot().data?.pending` is non-null, render `<LoadingYourData progress={pending.progress} />` instead of the empty state; when there is no snapshot and nothing pending, the owner gets the "Load your data" link to `/data` (coordinators: "Ask your agency owner to load data"). Test both with `?mock=loading` and `?mock=empty`.

## Responsive acceptance
- **Desktop:** header (title + open pill + subtitle) with the progress card on the right; four queue wells in a row (`grid-cols-4`), each with colored dot, title, count pill, hint, task cards.
- **Mobile:** wells stack in one column (or chips to switch queues if more than 2 are non-empty — use `Chip`s with counts, one queue visible at a time, default to the first non-empty); task cards full width with ≥ 44px tap targets.

## Done when (acceptance commands)
```bash
make web-test ARGS=src/features/next-actions
make e2e ARGS=next-actions         # next-actions-{desktop,mobile}.png
grep -rnE '#[0-9a-fA-F]{6}' frontend/src/features/next-actions | wc -l      # 0
docker compose exec web npm run typecheck && docker compose exec web npm run lint
make verify
```
`e2e/next-actions.spec.ts`: sign in as `dana@harbor.test` → lands on `/next-actions`; three open items; clicking Done on one → header `2 open`, progress `1 / 3`, card dims and button reads Undo; Undo restores; clicking a card opens `?lead=`; owner visiting `/next-actions` → redirected `/`. Compare with `design_handoff_simbe/screenshots/16-coordinator-next-actions.png`. Branch `lane/F-NEXTACTIONS-<slug>`; `bin/pr-ownership`; paste outputs in the PR.

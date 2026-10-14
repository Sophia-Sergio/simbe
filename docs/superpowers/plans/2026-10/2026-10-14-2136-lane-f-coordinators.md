# Lane F-COORDINATORS — Coordinators grid and detail (owner)

> **For Cursor / OpenCode:** Work only inside this lane's `Owns` list and follow the **frontend lane rules** in `docs/superpowers/parallel/README.md#frontend-lane-rules` (binding). Follow `docs/conventions/` and **`docs/design/brand.md`**. **Commit after every task** (`feat(f-coordinators): task N – <title>`).

**Lane:** F-COORDINATORS · **Wave:** 1 (frontend, mock API)
**Owns:** `frontend/src/features/coordinators/**`, `frontend/e2e/coordinators.spec.ts`
**Depends on (merged):** Wave 0
**Hooks consumed:** `useCoordinators()`, `useCoordinator(name)` (`@/api/hooks/coordinators`), `useLeadPanel().open`
**Kit consumed:** `Avatar`, `Pill`, `KpiCard`, `SegmentBar`, `Table`, `StatusPill`, `Skeleton`, `EmptyState`, `ErrorState`, `formatDuration`, `formatPct`
**Contract operations:** `listCoordinators`, `getCoordinator`
**Spec:** `docs/superpowers/specs/2026-10/2026-10-14-2008-leads-workflow-design.md` (decision 9)
**Detail reference:** `plans/2026-10/2026-10-14-2010-leads-workflow-ui.md` **Task 6 (Coordinators and detail)** — execute as written. Skip the rest.

## Feature registration (`src/features/coordinators/feature.ts`)
```ts
export const feature: FeatureModule = {
  id: "coordinators",
  routes: [
    { path: "coordinators", element: <CoordinatorsPage />, handle: { roles: ["owner"], title: "Coordinators" } },
    { path: "coordinators/:name", element: <CoordinatorPage />, handle: { roles: ["owner"], title: "Coordinator" } },
  ],
  nav: [{ id: "coordinators", label: "Coordinators", icon: UserCheck, section: "operations", roles: ["owner"], order: 50, to: "/coordinators",
          mobile: { more: { order: 2 } } }],
};
```

## Overrides
1. Fixtures `contracts/examples/coordinators/list.json` (Dana 4 leads/40%, Jess 3, Priya 3; all `on_track` in Alpha) and `detail-dana.json`; add a test variant with `status: "needs_support"` (Amber "Needs support" pill).
2. The mandatory footnote: "Differences can reflect lead mix as well as effort." Header shows an "Owner only" brand pill.
3. Stat formatting: first reply with `formatDuration` (`22.5` → `23m`), qualified rate `formatPct`, overdue integer.
4. Detail rows (`needs_action`) open the lead panel (`useLeadPanel().open(lead_id)`); coordinator names are URL-encoded in links.
5. Guard is declarative (`handle.roles: ["owner"]`) — coordinators are redirected by the app core; test only that a coordinator render of the route never fires the API (the guard handles it).

## Responsive acceptance
- **Desktop:** auto-fill grid `minmax(260px, 1fr)` of person cards (avatar, name, `N leads · X% of leads`, status pill, three stats); detail with back link, 4 KPIs and a "Leads needing action" list.
- **Mobile:** single-column cards, KPIs in 2 columns, list rows full width; no horizontal scroll.

## Done when (acceptance commands)
```bash
make web-test ARGS=src/features/coordinators
make e2e ARGS=coordinators         # coordinators-{desktop,mobile}.png, coordinator-detail-{desktop,mobile}.png
grep -rnE '#[0-9a-fA-F]{6}' frontend/src/features/coordinators | wc -l      # 0
docker compose exec web npm run typecheck && docker compose exec web npm run lint
make verify
```
`e2e/coordinators.spec.ts`: owner → three cards, `Owner only`, footnote text; click Dana → detail with `L4 Alpha`; clicking a needs-action row sets `?lead=`; coordinator visiting `/coordinators` → redirected to `/next-actions`. Compare with `design_handoff_simbe/screenshots/11-coordinators.png`. Branch `lane/F-COORDINATORS-<slug>`; `bin/pr-ownership`; paste outputs in the PR.

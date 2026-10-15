# Lane F-LEADPANEL — Lead slide-over panel

> **For Cursor / OpenCode:** Work only inside this lane's `Owns` list and follow the **frontend lane rules** in `docs/superpowers/parallel/README.md#frontend-lane-rules` (binding). Follow `docs/conventions/` (`sensitive-data.md`) and **`docs/design/brand.md`**. **Commit after every task** (`feat(f-leadpanel): task N – <title>`).

**Lane:** F-LEADPANEL · **Wave:** 1 (frontend, mock API)
**Owns:** `frontend/src/features/lead-panel/**`, `frontend/e2e/lead-panel.spec.ts`
**Depends on (merged):** Wave 0
**Hooks consumed:** `useLead(id)` (`@/api/hooks/leads`), `useToggleDone()` (`@/api/hooks/nextActions`), `useLeadPanel()` (`@/app/leadPanel`: `leadId`, `tab`, `close`, `prev`, `next`, `hasPrev/hasNext`), `useAuth()`, `useToast()`
**Kit consumed:** `Sheet`, `Tabs`, `Ring`, `StatusPill`, `SourcePill`, `Timeline`, `Pill`, `Button`, `Skeleton`, `ErrorState`, `Avatar`
**Contract operations:** `getLead`, `completeNextAction`, `undoNextAction`
**Spec:** `docs/superpowers/specs/2026-10/2026-10-14-2008-leads-workflow-design.md` (decisions 5, 6, 7)
**Detail reference:** `plans/2026-10/2026-10-14-2010-leads-workflow-ui.md` **Task 4 (Lead panel)** — execute as written. Skip Tasks 1–3 and 5–8.

## Feature registration (`src/features/lead-panel/feature.ts`)
```ts
export const feature: FeatureModule = {
  id: "lead-panel",
  overlays: [{ id: "lead-panel", component: LeadPanelOverlay }],   // renders <LeadPanel/> when useLeadPanel().leadId is set
};
```
No routes and no nav: any screen opens the panel through `useLeadPanel().open(id, tab?)` (URL `?lead=&tab=`).

## Overrides
1. The panel is the kit `Sheet` (620px desktop / full screen <860px); URL state comes from `useLeadPanel()` in Wave 0 — do not reimplement it. Prev/Next use `prev()/next()` and are disabled when `!hasPrev/!hasNext`.
2. **Sensitive data rules are tested here**: raw answers render only when the API response contains `answer` (never inferred); the owner fixture (`contracts/examples/leads/detail-owner.json`) shows 10 `Met` pills and **no** element with `data-testid="raw-answer"`; the assigned-coordinator fixture (`detail-coordinator.json`) shows answers; the footer note "Health answers are visible to the assigned coordinator only." is always shown on the Screener tab.
3. `can_contact` gates **Send text** (`sms:` link), **Call** (`tel:` link) and **Mark done**; **Book consult** is rendered disabled (`aria-disabled`, `title="Booking integration not connected"`); the "Actions ▾" menu contains only Send text/Call and is hidden when `!can_contact`.
4. **Mark done** is available when `detail.queue` is non-null: POST/DELETE through `useToggleDone`; button turns green "Done"; failure → toast "Couldn't save — try again".
5. Unknown/foreign ids: API 404 → "This lead isn't available" state (no flash of other data); network error → `ErrorState` with retry.
6. Summary tab "Simbe summary" renders `summary.text` and "Suggested next step: …" from `summary.next_step`.

## Responsive acceptance
- **Desktop:** right slide-over 620px with 200ms ease-out slide, scrim, header (name 17px display, coordinator, "Stage · Status", Prev/Next/Close), action row, three-column top grid (Contact / Ring / Consult), segmented tabs.
- **Mobile:** full-screen sheet (icon-only Prev/Next/Close), top grid stacked, tabs scroll-free, bottom safe-area padding; Esc/Close returns to the previous screen without losing scroll.

## Done when (acceptance commands)
```bash
make web-test ARGS=src/features/lead-panel
make e2e ARGS=lead-panel           # lead-panel-{desktop,mobile}.png (summary + screener tabs)
grep -rnE '#[0-9a-fA-F]{6}' frontend/src/features/lead-panel | wc -l      # 0
docker compose exec web npm run typecheck && docker compose exec web npm run lint
make verify
```
`e2e/lead-panel.spec.ts`: open `/?lead=aaaaaaaa-0000-4000-8000-000000000004&tab=screener` as owner → 10 `Met` pills, no raw answers, masked phone; as coordinator Dana → raw answers visible, Send text/Call links present; coordinator opening another coordinator's lead id → "isn't available"; Esc closes; Mark done toggles. Compare with `design_handoff_simbe/screenshots/09-lead-panel-summary.png` and `10-lead-panel-screener.png`. Branch `lane/F-LEADPANEL-<slug>`; `bin/pr-ownership`; paste outputs in the PR.

# W3-3 Mobile, accessibility and brand audit

> **For Cursor / OpenCode:** Implement task-by-task. Follow `docs/conventions/` and **`docs/design/brand.md`**. Stop if blocked. **Commit after every task** (`fix(audit): task N – <screen>`). Ownership is relaxed in Wave 3: fixes may touch the owning feature folder, **one small PR per screen**.

**Lane:** W3-3 · **Wave:** 3 (after W3-1; parallel with W3-2)
**Owns:** `e2e/audit/**`, `docs/superpowers/parallel/audit-report.md`, plus the Wave-3 audit fixes and the axe dev dependency (conductor ruling: ownership is relaxed for the audit's fixes, Task 1 adds `@axe-core/playwright`, and the 2026-10-18 review extended the line again for the K1/K2 pass): `app/javascript/app/AppShell.tsx`, `app/javascript/app/shell/desktop/NavSection.tsx`, `app/javascript/app/shell/mobile/TabBar.test.tsx`, `app/javascript/app/shell/mobile/TabBar.tsx`, `app/javascript/app/shell/mobile/TabItem.tsx`, `app/javascript/app/shell/mobile/TopBar.tsx`, `app/javascript/components/ui/Button.test.tsx`, `app/javascript/components/ui/Button.tsx`, `app/javascript/components/ui/Chip.tsx`, `app/javascript/components/ui/Dropzone.tsx`, `app/javascript/components/ui/Input.test.tsx`, `app/javascript/components/ui/Input.tsx`, `app/javascript/components/ui/KpiCard.tsx`, `app/javascript/components/ui/Modal.tsx`, `app/javascript/components/ui/Segmented.tsx`, `app/javascript/components/ui/Select.tsx`, `app/javascript/components/ui/Sheet.tsx`, `app/javascript/components/ui/SourcePill.tsx`, `app/javascript/components/ui/StatusPill.test.tsx`, `app/javascript/components/ui/StatusPill.tsx`, `app/javascript/components/ui/Tabs.tsx`, `app/javascript/features/agent/AgentFab.tsx`, `app/javascript/features/agent/AgentPanel.tsx`, `app/javascript/features/agent/SuggestionChips.tsx`, `app/javascript/features/channels/ChannelPage.tsx`, `app/javascript/features/connect/ConnectPage.tsx`, `app/javascript/features/coordinators/CoordinatorPage.tsx`, `app/javascript/features/data/DataSourcesPage.tsx`, `app/javascript/features/data/UploadModal.tsx`, `app/javascript/features/lead-panel/LeadPanel.test.tsx`, `app/javascript/features/lead-panel/LeadPanel.tsx`, `app/javascript/features/lead-panel/SummaryTab.tsx`, `app/javascript/features/next-actions/NextActionsPage.tsx`, `app/javascript/features/next-actions/TaskCard.tsx`, `app/javascript/features/pipeline/components/ColumnChips.tsx`, `app/javascript/features/search/SearchPalette.tsx`, `app/javascript/features/signup/WizardShell.tsx`, `app/javascript/features/signup/steps/LoadDataStep.tsx`, `app/javascript/features/week/RecommendationCard.tsx`, `package-lock.json`, `package.json`
**Depends on (merged):** W3-1
**Goal:** A systematic pass over every screen at phone, tablet and desktop widths: no horizontal scroll, tap targets, keyboard/focus, color contrast, brand fidelity, and parity with the design handoff.
**Spec:** `docs/superpowers/specs/2026-10/2026-10-14-2102-ui-kit-and-shell-design.md` (decisions 9, 10)

## Global Constraints
- Widths: 360, 390, 430 (phone), 768, 859, 860 (breakpoint edges), 1024, 1280, 1440. At 859 the mobile shell is used; at 860 the desktop shell.
- Contrast: WCAG AA (axe `color-contrast` must pass; small brand-colored text uses `brand.text`).
- Brand: no raw hex outside tokens/`ChannelTile`; Inter + Outfit loaded; logo mark un-tinted; pill buttons, 16–24px card radii.

## Review Focus
- The 859↔860px switch preserves route, scroll position of the main area and open overlays (lead panel stays open).
- iOS safe areas (notch/home indicator) — bottom tab bar and sticky footers.
- Long names/emails, 0 results and 1,000+ counts do not break layouts.

---

## Task 1: Automated audit harness
- [x] Add `@axe-core/playwright`. `e2e/audit/screens.ts` lists every route with its role and a ready-state selector: `/`, `/funnel`, `/channels`, `/channels/Facebook`, `/pipeline` (+ `?lead=…&tab=summary|screener|activity|source`), `/coordinators`, `/coordinators/Dana%20Ortiz`, `/data` (+ upload modal states), `/connect`, `/settings`, `/next-actions`, `/signin`, `/signup` (5 steps), `/invite/<token>`, agent panel open, search palette open, `/__kit`.
- [x] `audit.spec.ts` loops screens × widths: asserts `scrollWidth <= innerWidth`, no element overflowing its container (`el.scrollWidth > el.clientWidth` on non-scroll containers), interactive targets ≥ 44×44 px on `<860px` widths, axe has no `serious|critical` violations, focus order reaches the primary action by keyboard, `prefers-reduced-motion` disables slide/pulse animations. Writes a table to `docs/superpowers/parallel/audit-report.md`.
- [x] Run it; commit the harness and the first report.

## Task 2: Fix pass (one PR per screen)
- [x] For each failing screen/width fix in the owning feature (or kit) and re-run only that screen. Typical fixes: wrap/truncate long text, `min-w-0` on flex children, sticky footers with safe-area padding, bigger hit areas via padding, `aria-label`s, focus-visible rings, `brand.text` for small links.

## Task 3: Brand and design parity review
- [x] For each screen take desktop (1280) and mobile (390) screenshots (the journeys already produce many), place them next to the matching `handoff/design/screenshots/*.png` and the phone frames in `handoff/design/prototype/Simbe Screens.dc.html`; record deviations in the audit report as **Intentional** (documented in `docs/design/brand.md`: colors, fonts, pill shapes, logo, no "view as" toggle, Reveal→Generate key) or **Bug** (fix it). Run `grep -rnE '#[0-9a-fA-F]{6}' app/javascript | grep -v "ChannelTile\|tailwind\|tokens.css\|\.test\."` → empty; fonts verified via computed styles in the audit spec (`font-family` of body starts with Inter, headings Outfit).

## Task 4: Finish
- [ ] Final report committed (`audit-report.md`: widths × screens matrix all green, list of intentional deviations). `make verify` → exit 0. Open PR.

## Done when (acceptance commands)
```bash
E2E_API=real make e2e ARGS=audit                       # zero failures at all nine widths
grep -c "FAIL" docs/superpowers/parallel/audit-report.md   # 0
grep -rnE '#[0-9a-fA-F]{6}' app/javascript | grep -v "ChannelTile\|tailwind\|tokens.css\|\.test\." | wc -l   # 0
make verify
```

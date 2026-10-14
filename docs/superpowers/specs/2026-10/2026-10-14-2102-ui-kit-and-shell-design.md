# UI kit, app shell and feature extension points (desktop + mobile) — Design

**Status:** Approved for planning · **Depends on:** `2100`, `2101` · **Plans:** `2104` repo scaffold (registry contracts), `2107` kit primitives, `2108` kit data-viz, `2109` app core, `2110` desktop shell, `2111` mobile shell

## Goal
Provide every shared visual and structural piece once — tokens, generic components, the desktop and mobile shells, role-aware navigation, overlay slots and test helpers — so feature lanes only compose them and never edit shared files.

## Findings
- Handoff "App shell": desktop ≥860px (224px sidebar, 56px top bar, FAB, main max 1200px) and mobile <860px (top bar, bottom tab bar, More sheet, no FAB, full-screen panels/agent, bottom-sheet modals). Owner tabs Home/Pipeline/Channels/Ask/More; coordinator tabs Next actions/My leads/Ask.
- Brand tokens, type, radii, logo: `docs/design/brand.md` (overrides handoff).
- Overlays that many screens open: lead panel (pipeline, coordinators, next actions, search), search palette (top bar), agent panel (FAB/tab, "Ask why" buttons).
- Screens needing generic pieces: KPI cards, donut/ring, bars, 6-segment progress bar, status/source pills, channel tiles, tables that become stacked cards on mobile, segmented controls, toasts, modals/sheets, skeletons, empty states.

## Decisions
1. **Feature module contract** (`src/app/feature.ts`, owned by the scaffold plan):
```ts
export type NavItem = {
  id: string; label: string; icon: LucideIcon; section: "insights" | "operations" | "agency" | "today";
  roles: Role[]; order: number;
  to?: string;                         // link target
  useOnSelect?: () => () => void;      // action item (e.g. Ask opens the agent) - a hook returning a handler
  useBadge?: () => number | undefined; // count pill (Pipeline action_needed, Next actions open)
  mobile?: { tab?: { order: number; label?: string }; more?: { order: number } };
};
export type FeatureModule = {
  id: string;
  routes?: RouteObject[];                       // children of the authenticated layout; guard with handle: { roles }
  publicRoutes?: RouteObject[];                 // sign-in, sign-up, accept-invite
  nav?: NavItem[];
  overlays?: { id: string; component: React.ComponentType }[];   // mounted once inside AppShell
  providers?: { id: string; order: number; component: React.ComponentType<{ children: React.ReactNode }> }[];
  fab?: React.ComponentType;                    // desktop floating button
  topBarRight?: React.ComponentType[];          // e.g. snapshot pill
};
```
   `src/app/registry.ts` loads `import.meta.glob("/src/features/*/feature.ts", { eager: true })` and builds the router, nav, overlay list and provider stack. **A lane adds its screens by creating `src/features/<lane>/feature.ts`; no other file changes.**
2. **Role guard**: a route with `handle: { roles: ["owner"] }` renders `<Navigate to="/next-actions">` for coordinators; owners hitting coordinator-only routes go to `/`. `/` resolves by role (owner → This week lane's route, coordinator → `/next-actions`) via `src/app/HomeRedirect.tsx`.
3. **Cross-lane contracts with defaults** (`src/app/`): `useLeadPanel()` (URL params `lead`, `tab ∈ summary|screener|activity|source`; `open(id, tab?)`, `close()`, `setIds(ids)`, `prev()`, `next()`) fully implemented in the app core; the lead-panel lane only mounts `<LeadPanel/>` as an overlay. `AgentContext` / `useAgent()` (`open(question?)`, `close()`, `isOpen`) ships with a no-op default; the agent lane registers a provider that supplies the real implementation. `useToast()` comes from the kit.
4. **Responsive switch**: `useIsDesktop()` (`matchMedia("(min-width: 860px)")`, SSR-safe default true) drives `AppShell` to render `DesktopShell` or `MobileShell`; the two shells are separate lanes with disjoint files (`src/app/shell/desktop/**`, `src/app/shell/mobile/**`) behind the same `ShellProps` (`children`, `nav`, `overlays`, `fab`, `topBarRight`, `user`, `agency`). Shared `Avatar`, `NavIcon`, `BrandMark` (the logo mark) live in the kit.
5. **Desktop shell** (per handoff): sidebar 224px (brand mark + "Simbe", collapse chevron, agency switcher box [static — single agency per login], nav sections with items 36px high, active `bg-brand-tint text-brand-text font-semibold rounded-full`, count pills, footer avatar + name + role + Sign out), top bar 56px (centered 360×36 search button "Search candidates…" + ⌘K hint that opens the search overlay via `useSearchPalette()`, `topBarRight` slots, avatar), main `max-w-[1200px] px-8 pt-7 pb-[110px]`, FAB slot bottom-right 24px. **Mobile shell**: top bar (mark + current screen name from route `handle.title`, avatar), bottom tab bar (58px tabs, 22px icons, 11px labels; owner Home/Pipeline/Channels/Ask/More, coordinator Next actions/My leads/Ask — derived from `nav[].mobile.tab`), More sheet (18px→24px top radius, drag handle, 48px rows from `nav[].mobile.more`), main padding `18px 14px 110px`, no FAB, safe-area insets (`env(safe-area-inset-bottom)`).
6. **Kit** (`src/components/ui/`, read-only for feature lanes; each with tests and a `/__kit` gallery section): *Primitives (plan 2107)* — `Button` (primary | outline-brand | secondary | ghost | danger; `pending`), `Pill`, `Input`/`Field`, `Select`, `Segmented`, `Tabs` (segmented full width), `Chip` (selectable), `Avatar`, `Skeleton`, `EmptyState`, `ErrorState` (retry), `Toast` + `useToast`, `Modal` (desktop centered max 480 / mobile bottom sheet), `Sheet` (right panel 620 / mobile full screen), `ConfirmInline` (inline confirm panel, no native dialogs), `Spinner`, `useAsyncAction`, `useDismiss` (Esc + outside click), `Dropzone`. *Data-viz (plan 2108)* — `KpiCard`, `Donut`, `Ring`, `BarRow`, `ProgressBar` (segments), `SegmentBar` (KPI bar: fill | thirds), `StatusPill`, `SourcePill`, `ChannelTile`, `Table` (+ stacked-card mobile mode), `Timeline`, `BarChart` (agent), `RangeControl`.
7. **Brand tokens** in `tailwind.config.ts` + `tokens.css` exactly as `docs/design/brand.md` (scaffold plan); no raw hex outside those files and `ChannelTile` (channel placeholder colors).
8. **Test helpers** (`src/test/`): `renderWithProviders(ui, { route, path, role = "owner", viewport, agentOpen })` mounts QueryClient (retry off), MemoryRouter, Toast, auth (via the mock API session) and feature providers; `setViewport`, `mockApi` from the contract tooling plan.
9. **Gallery & visual check**: `/__kit` (dev + e2e only) renders every kit component in light theme at both viewports; `e2e/kit.spec.ts` screenshots it at 1280×800 and 390×844.
10. **Accessibility baseline**: all interactive kit parts keyboard-operable, visible focus ring (`outline 2px solid #FF8DAC`), `aria-label`s on icon-only buttons, dialogs trap focus and close on Esc, charts expose `role="img"` with text alternatives.

## Non-goals
Dark mode, i18n, a design-token build pipeline (tokens are hand-written), component documentation site beyond `/__kit`, animations beyond the specified slide/fade/pulse.

## Acceptance criteria
1. `make web-test ARGS=src/components/ui src/app` passes (every kit component renders, is keyboard-operable where interactive; registry builds routes/nav/overlays from two fixture feature modules; role guard redirects; `useLeadPanel` URL round-trips).
2. `make web-test ARGS=src/app/shell` passes: owner desktop nav shows Insights/Operations/Agency; coordinator shows only Today; at 500px width the tab bar renders with Home/Pipeline/Channels/Ask/More for owners and Next actions/My leads/Ask for coordinators; More sheet lists the `mobile.more` items.
3. `make e2e ARGS=kit` passes and writes `kit-desktop.png` and `kit-mobile.png`; `make e2e ARGS=shell` passes (sign in as owner and coordinator in mock mode, both viewports, screenshots saved).
4. `grep -rniE '#be3a5f|#fdf2f5|#1c1917|#fafaf9' frontend/src frontend/tailwind.config.ts` prints nothing; `grep -rnE '#[0-9a-fA-F]{6}' frontend/src --include=*.tsx | grep -v "ChannelTile\|\.test\." | wc -l` prints `0`.
5. Adding `src/features/demo/feature.ts` (fixture) with one route, one nav item and one overlay makes all three appear without editing any other file: `make web-test ARGS=src/app/registry` includes that case.
6. `grep -rn "window.confirm\|window.alert\|prompt(" frontend/src | wc -l` prints `0`.

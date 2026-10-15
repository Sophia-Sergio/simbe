# W0-4A UI Kit — Primitives Implementation Plan

> **For Cursor / OpenCode:** Implement task-by-task. Follow `docs/conventions/` and **`docs/design/brand.md`** (every color/radius/shadow comes from Tailwind tokens defined in W0-1; no raw hex). Stop if blocked — do not replan silently. **Commit after every task** (`feat(kit): task N – <component>`). Tasks 2–9 touch disjoint files and may be split across agents.

**Lane:** W0-4A · **Wave:** 0 (after W0-1; parallel with W0-2, W0-3)
**Owns:** `app/javascript/components/ui/{Button,Pill,Field,Input,Select,Segmented,Tabs,Chip,Avatar,Skeleton,EmptyState,ErrorState,Toast,Modal,Sheet,ConfirmInline,Spinner,Dropzone,BrandMark}.tsx`, `app/javascript/components/ui/*.test.tsx`, `app/javascript/components/ui/test-utils.ts`, `app/javascript/hooks/{useAsyncAction,useDismiss,useIsDesktop,useMediaQuery}.ts`, `app/javascript/hooks/{useAsyncAction,useDismiss,useIsDesktop,useMediaQuery}.test.{ts,tsx}`, `app/javascript/features/_kit/**`, `e2e/{kit,smoke}.spec.ts`
**Depends on (merged):** W0-1 (tokens, registry types)
**Unblocks:** W0-4B, W0-5, W0-6A/B, every frontend lane
**Goal:** The generic, brand-correct interactive building blocks (desktop + mobile behavior built in) and the `/__kit` gallery.
**Spec:** `docs/superpowers/specs/2026-10/2026-10-14-2102-ui-kit-and-shell-design.md` (decisions 6, 7, 9, 10)

## Global Constraints
- Tailwind tokens only (`bg-brand`, `text-ink-muted`, `rounded-full`, `rounded-input`, `rounded-card`, `rounded-modal`, `shadow-card`…). Breakpoint `md` = 860px.
- Buttons/pills/chips/segmented/avatars are `rounded-full`; inputs `rounded-input`; modals `rounded-modal`; focus ring from `tokens.css`.
- Mobile behavior lives **inside** components: `Modal` → bottom sheet, `Sheet` → full screen below 860px.
- No native `confirm/alert/prompt`. No overlay-on-overlay: opening a `Modal` while a `Sheet` is open is allowed only through `ConfirmInline` inside the sheet (documented in the gallery).

## Review Focus
- `Esc` and scrim click close `Modal`/`Sheet` exactly once; focus returns to the opener.
- `Toast` stacking: a second toast replaces the first; timer resets.
- `useAsyncAction` ignores re-entrant calls and resets `pending` when the action throws.
- Rendering at 390px and 1280px both produce a usable layout (no horizontal scroll) in the gallery.
- Icon-only buttons have `aria-label`.

---

## File Map

| Action | Path |
|--------|------|
| Create | `app/javascript/hooks/{useAsyncAction,useDismiss,useIsDesktop,useMediaQuery}.ts` |
| Create | `app/javascript/components/ui/*.tsx` (list above) + `*.test.tsx` |
| Create | `app/javascript/features/_kit/feature.ts`, `app/javascript/features/_kit/KitGallery.tsx`, `app/javascript/features/_kit/sections/Primitives.tsx` |
| Create | `e2e/kit.spec.ts` |

---

## Task 1: Hooks

**Interfaces — Produces:**
```ts
useMediaQuery(query: string): boolean
useIsDesktop(): boolean                       // useMediaQuery("(min-width: 860px)"), true during SSR/test default
useAsyncAction<A extends unknown[], R>(fn: (...a: A) => Promise<R>): { run: (...a: A) => Promise<R | undefined>; pending: boolean }
useDismiss(opts: { ref: RefObject<HTMLElement>; onDismiss: () => void; enabled?: boolean }): void   // Esc + outside pointerdown
```
- [x] **Step 1: Failing tests**
```ts
it("useAsyncAction ignores re-entrant calls and resets after errors", async () => {
  let n = 0; const fn = vi.fn(async () => { n++; await Promise.resolve(); if (n === 1) throw new Error("x"); return "ok"; });
  const { result } = renderHook(() => useAsyncAction(fn));
  let p1!: Promise<unknown>; act(() => { p1 = result.current.run(); result.current.run(); });
  expect(fn).toHaveBeenCalledTimes(1); expect(result.current.pending).toBe(true);
  await act(async () => { await p1.catch(() => undefined); });
  expect(result.current.pending).toBe(false);
  await act(async () => { expect(await result.current.run()).toBe("ok"); });
});
it("useDismiss fires on Escape and outside click, not inside", () => { /* ref div; keydown Escape → called; pointerdown outside → called; inside → not */ });
it("useIsDesktop tracks matchMedia", () => { setViewport(500); /* false */ act(() => setViewport(1280)); /* true */ });
```
- [x] **Step 2:** FAIL; **Step 3:** implement (the `useAsyncAction` from foundation Task 6 Step 4 with a `try/finally` and swallowing nothing — it rethrows; callers handle). **Step 4:** pass. Commit.

---

## Task 2: Button, Pill, Spinner, BrandMark

**Interfaces:**
```ts
<Button variant?: "primary"|"outline-brand"|"secondary"|"ghost"|"danger" size?: "md"|"sm" pending?: boolean leftIcon?: ReactNode ...ButtonHTMLAttributes />
<LinkButton to variant? size? ...>                 // react-router Link styled as Button
<Pill tone?: "neutral"|"success"|"warning"|"danger"|"violet"|"brand"|"outline">
<Spinner size?: number />
<BrandMark size?: number />                         // <img src="/brand/simbe-mark.png" alt="Simbe" />
```
Styles: md = 36px high, sm = 30px, `px-4`, `text-[14px] font-semibold`, `rounded-full`; primary `bg-brand text-white hover:bg-brand-hover`; outline-brand `border border-brand-border text-brand-text hover:bg-brand-tint`; secondary `bg-surface border border-line text-ink hover:bg-subtle`; ghost `text-ink-secondary hover:bg-subtle`; danger `bg-danger text-white`. Pill: `text-[11px] font-medium rounded-full px-2 py-0.5 border` with tone colors (`bg-success-bg text-success-text border-success-border`, etc.).
- [x] **Tests:** renders each variant with the right classes; `pending` sets `aria-busy`, disables the button and shows a spinner but keeps the label width; clicking a pending button does nothing; `LinkButton` renders an anchor with `href`; `Pill` tone classes; `BrandMark` has `alt="Simbe"` and uses the committed asset path.
- [x] Steps: failing tests → implement → pass → commit.

---

## Task 3: Field, Input, Select

**Interfaces:** `<Field label error hint htmlFor?>{children}</Field>`; `<Input invalid? ...InputHTMLAttributes />` (40px, `rounded-input`, `border-line`, focus ring); `<Select options value onChange />` (native `<select>` styled; no custom popup to keep mobile native).
- [x] **Tests:** `getByLabelText("Work email")` resolves through `Field`; error text is announced (`role="alert"`) and sets `aria-invalid`; hint linked via `aria-describedby`; `Select` change fires with the string value.

---

## Task 4: Segmented, Tabs, Chip

**Interfaces:**
```ts
<Segmented value options={[{ value, label }]} onChange aria-label />     // buttons with aria-pressed; track bg-subtle rounded-full; selected thumb bg-surface shadow-card
<Tabs value onChange tabs={[{ value, label }]} />                          // full-width segmented with role="tablist"/"tab" + aria-selected; arrow keys move selection
<Chip selected onClick leading?>label</Chip>                               // rounded-full; selected bg-brand-tint border-brand-border text-brand-text; aria-pressed
```
- [x] **Tests:** click selects; keyboard (←/→ on Tabs); `aria-pressed`/`aria-selected` states; `Segmented` accepts 3 options (30 days / 90 days / 12 months) without wrapping at 390px (snapshot of class `whitespace-nowrap`).

---

## Task 5: Avatar, Skeleton, EmptyState, ErrorState

**Interfaces:** `<Avatar name size?: 26|30|36|44 tone?>` (initials, `rounded-full`, bg from a stable hash of the name over brand-safe tints); `<Skeleton className />` (`animate-pulse bg-subtle rounded-card`); `<EmptyState title body? action?: ReactNode />`; `<ErrorState message onRetry />` (Retry is a `Button`).
- [x] **Tests:** initials for `"Erin Walsh"` → `EW`, single names, empty name → `?`; same name → same color class; ErrorState calls `onRetry`; EmptyState renders the action.

---

## Task 6: Toast

**Interfaces:** `<ToastProvider>`; `useToast(): { show(message: string, opts?: { tone?: "success" }): void }`.
Behavior: dark (`bg-dark`), white text, green check icon, `shadow-toast`, `rounded-full`, centered, `bottom-[28px]` desktop / `bottom-[84px]` mobile (above the tab bar), auto-dismiss after **2600 ms**, `role="status"` `aria-live="polite"`; a new `show` replaces the current toast and restarts the timer.
- [x] **Failing test**
```tsx
it("shows, replaces and auto-dismisses after 2.6s", () => {
  vi.useFakeTimers(); render(<ToastProvider><Probe /></ToastProvider>);   // Probe has two buttons calling show("A") / show("B")
  fireEvent.click(screen.getByText("a")); expect(screen.getByRole("status")).toHaveTextContent("A");
  act(() => vi.advanceTimersByTime(2000)); fireEvent.click(screen.getByText("b")); expect(screen.getByRole("status")).toHaveTextContent("B");
  act(() => vi.advanceTimersByTime(2599)); expect(screen.queryByRole("status")).not.toBeNull();
  act(() => vi.advanceTimersByTime(2)); expect(screen.queryByRole("status")).toBeNull();
});
it("sits above the tab bar on mobile", () => { setViewport(390); /* class bottom-[84px] */ });
```
- [x] Steps: FAIL → implement → pass → commit.

---

## Task 7: Modal and Sheet

**Interfaces:**
```ts
<Modal open onClose title? children footer? size?: "sm"|"md" />   // role="dialog" aria-modal; desktop: centered max-w 480 rounded-modal shadow-modal; <860px: bottom sheet (data-variant="sheet", rounded-t-[24px], drag handle)
<Sheet open onClose title? header? children />                    // right slide-over 620px (data-variant="panel", slides 200ms ease-out from translateX(24px)+opacity 0, scrim rgba(250,250,249,.6)); <860px: full screen
```
Both: Esc closes, scrim click closes, focus moves into the dialog on open and returns to the opener on close, `body` scroll locked, `inert`/aria-hidden on the rest of the app while open.
- [x] **Failing tests**
```tsx
it("Modal closes on Esc and scrim click and restores focus", async () => {
  const onClose = vi.fn(); const { rerender } = render(<><button>opener</button><Modal open onClose={onClose} title="T">body</Modal></>);
  await userEvent.keyboard("{Escape}"); expect(onClose).toHaveBeenCalledTimes(1);
  await userEvent.click(screen.getByTestId("scrim")); expect(onClose).toHaveBeenCalledTimes(2);
});
it("Modal is a bottom sheet under 860px", () => { setViewport(390); render(<Modal open onClose={() => {}} title="T">x</Modal>); expect(screen.getByRole("dialog")).toHaveAttribute("data-variant", "sheet"); });
it("Sheet is a 620px panel on desktop and full screen on mobile", () => { setViewport(1280); /* data-variant panel, class w-[620px] */ setViewport(390); /* full screen: class inset-0 */ });
it("traps focus: Tab cycles inside the dialog", async () => { /* two buttons inside; Tab from last goes to first */ });
it("does not render when closed and unmounts listeners", () => { /* ... */ });
```
- [x] Steps: FAIL → implement (portal to `document.body`; use `useDismiss`) → pass → commit.

---

## Task 8: ConfirmInline and Dropzone

**Interfaces:** `<ConfirmInline message confirmLabel cancelLabel? tone?: "danger"|"brand" pending? onConfirm onCancel />` (an inline `bg-warning-bg` panel, never a dialog); `<Dropzone accept=".csv" multiple label="Drop your 7 CSV exports" ariaLabel="CSV files" disabled? onFiles(files: File[]) />` (dashed `border-line-strong rounded-card`, drag-over highlight `border-brand bg-brand-tint`, click opens the file picker; hidden `<input type="file">` labelled by `ariaLabel`).
- [x] **Tests:** `userEvent.upload(screen.getByLabelText("CSV files"), [f1, f2])` calls `onFiles` with both; dropping files via `fireEvent.drop` works; files not matching `accept` are filtered out and reported via `onRejected?.(files)`; disabled blocks both paths; ConfirmInline calls the right handlers and disables buttons while `pending`.

---

## Task 9: `/__kit` gallery and e2e

**Files:** `app/javascript/features/_kit/{feature.ts,KitGallery.tsx,sections/Primitives.tsx}`, `e2e/smoke.spec.ts`.
**Interfaces — Produces:** route `/__kit` (public, dev/e2e only: `import.meta.env.DEV || import.meta.env.MODE === "e2e"`), sections auto-collected with `import.meta.glob("./sections/*.tsx", { eager: true })` so W0-4B adds `sections/DataViz.tsx` without touching this plan's files.
- [x] **Step 1:** Gallery renders every primitive in all variants/states (pending, disabled, error, long labels) and has buttons that open a `Modal`, a `Sheet`, fire a `Toast`.
- [ ] **Step 2: e2e** — `kit.spec.ts` visits `/__kit`, asserts each section heading, opens modal/sheet/toast, and saves `e2e/screenshots/kit-desktop.png` and `kit-mobile.png` (Playwright projects `desktop`/`mobile`); fail on any horizontal scroll (`document.documentElement.scrollWidth <= window.innerWidth`).
  > Deferred to W0-5: the `/__kit` e2e needs the router that W0-5 mounts.
- [ ] **Step 3:** `make web-test ARGS=app/javascript/components/ui app/javascript/hooks`, `make e2e ARGS=kit`, typecheck, lint, and `grep -rnE '#[0-9a-fA-F]{6}' app/javascript/components/ui | wc -l` → `0`. `make verify` → exit 0. Commit; open PR.

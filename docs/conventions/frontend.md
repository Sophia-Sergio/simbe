# Frontend

- React 18 + TypeScript (strict) + Vite + Tailwind. Icons: `lucide-react`. Router: React Router. Server state: TanStack Query. Folder layout: `src/{api,components,features/<feature>,hooks,lib,routes,styles}`.
- **Design is final** (`design_handoff_simbe/README.md`): tokens live in `tailwind.config.ts` / `src/styles/tokens.css` exactly as the handoff lists them. Do not invent colors, radii or spacing.
- **HTTP only through `src/api/`** using `jsonRequest` (CSRF/auth header, error envelope → `ApiError`). No `fetch` in components.
- **Responsive**: breakpoint 860px. Mobile shell below it (top bar, bottom tab bar, bottom sheets, full-screen panels).
- **Dialogs**: no native `alert/confirm/prompt`; never an overlay on top of an overlay. Toasts auto-dismiss after 2.6s.
- **Single-flight**: click-triggered mutations go through `useAsyncAction`; the button is disabled while pending.
- Role gating in the UI is cosmetic; the API enforces it.
- Accessibility: focus ring `2px solid #e6a3b6` offset 2px, labels on inputs, Esc closes panels.
- Verify visually against `design_handoff_simbe/screenshots/` at 1280px and 390px widths.

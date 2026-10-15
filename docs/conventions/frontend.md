# Frontend

- React 19 + TypeScript (strict), embedded in Rails with `vite_rails` (no Inertia), Tailwind 3.4. Icons: `lucide-react`. Router: React Router. Server state: TanStack Query. Folder layout (`app/javascript/`): `entrypoints/`, `app/` (shell, registry, auth), `api/` (client, generated types, hooks), `mocks/` (MSW), `components/{ui,shared}/`, `hooks/`, `lib/`, `styles/`, `test/`, `features/<lane>/` (one folder per lane, registered by its `feature.ts`).
- **Layout/behavior is final** (`handoff/design/README.md`). **Colors, type, radii and logo come from `docs/design/brand.md`** (taken from simbefamily.com) and override the handoff's brand values. Tokens live in `tailwind.config.ts` / `app/javascript/styles/tokens.css`. Do not invent colors, radii or spacing; the logo is `public/brand/simbe-mark.png`, never recolored.
- **HTTP only through `app/javascript/api/`** using `jsonRequest` (CSRF/auth header, error envelope → `ApiError`). No `fetch` in components.
- **Responsive**: breakpoint 860px. Mobile shell below it (top bar, bottom tab bar, bottom sheets, full-screen panels).
- **Dialogs**: no native `alert/confirm/prompt`; never an overlay on top of an overlay. Toasts auto-dismiss after 2.6s.
- **Single-flight**: click-triggered mutations go through `useAsyncAction`; the button is disabled while pending.
- Role gating in the UI is cosmetic; the API enforces it.
- Accessibility: focus ring `2px solid #e6a3b6` offset 2px, labels on inputs, Esc closes panels.
- Verify visually against `handoff/design/screenshots/` at 1280px and 390px widths.

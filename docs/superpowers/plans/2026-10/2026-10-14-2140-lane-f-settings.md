# Lane F-SETTINGS — Settings and invitation acceptance

> **For Cursor / OpenCode:** Work only inside this lane's `Owns` list and follow the **frontend lane rules** in `docs/superpowers/parallel/README.md#frontend-lane-rules` (binding). Follow `docs/conventions/` and **`docs/design/brand.md`**. **Commit after every task** (`feat(f-settings): task N – <title>`).

**Lane:** F-SETTINGS · **Wave:** 1 (frontend, mock API)
**Owns:** `frontend/src/features/settings/**`, `frontend/e2e/settings.spec.ts`
**Depends on (merged):** Wave 0
**Hooks consumed:** `useAuth()`, `useUpdateAgency()`, `useTeam()`, `useInviteCoordinator()`, `useDeleteInvitation()`, `useCoordinatorNames()`, `useInvitationPreview(token)`, `useAcceptInvitation(token)` (`@/api/hooks/account`), `useToast()`
**Kit consumed:** `QualifiedRadioCards`, `TimezoneChips`, `Field`, `Input`, `Button`, `Pill`, `Avatar`, `BrandMark`, `Skeleton`, `ErrorState`, `ConfirmInline`
**Contract operations:** `getAgency`, `updateAgency`, `getTeam`, `createInvitation`, `deleteInvitation`, `listCoordinatorNames`, `getInvitation`, `acceptInvitation`
**Spec:** `docs/superpowers/specs/2026-10/2026-10-14-2011-onboarding-settings-data-design.md` (decisions 3, 7, 8, 9)
**Detail reference:** `plans/2026-10/2026-10-14-2012-onboarding-settings-data.md` **Task 6 (Settings page and invite acceptance page)** — execute as written, using the kit's `QualifiedRadioCards`/`TimezoneChips`. Skip the rest.

## Feature registration (`src/features/settings/feature.ts`)
```ts
export const feature: FeatureModule = {
  id: "settings",
  routes: [{ path: "settings", element: <SettingsPage />, handle: { roles: ["owner"], title: "Settings" } }],
  publicRoutes: [{ path: "/invite/:token", element: <AcceptInvitePage /> }],
  nav: [{ id: "settings", label: "Settings", icon: Sliders, section: "agency", roles: ["owner"], order: 80, to: "/settings",
          mobile: { more: { order: 5 } } }],
};
```

## Overrides
1. Definition cards save **immediately** (`useUpdateAgency`) with the toast "Saved. Every number now uses this definition."; time-zone chips save with the same pattern; invite shows "Invitation sent" and the new row with a **Copy invite link** button (the response's `accept_url`); revoking uses an inline `ConfirmInline`.
2. Team card: rows with avatar, name/email, role pill (Owner brand / Coordinator neutral / Invited amber) and an invite footer on `bg-app`; coordinator picker from `useCoordinatorNames()`; `unknown_coordinator` shows `valid_names`.
3. `AcceptInvitePage` (public): shows the agency name and email from the preview, asks for name + password (≥ 10 chars), creates the account and redirects to `/next-actions`; expired/used token (410) → "This invitation has expired. Ask your agency owner for a new one."
4. Max width 720px, three cards (Definition of qualified, Time zone, Team).
5. No storage of passwords or tokens (tokens live in the URL only).

## Responsive acceptance
- **Desktop:** single 720px column of three cards; radio cards full width; team rows with role pills on the right.
- **Mobile:** same column edge to edge (14px gutters), radio cards stack, chips wrap, invite form stacks (input above button); accept-invite card fills the width.

## Done when (acceptance commands)
```bash
make web-test ARGS=src/features/settings
make e2e ARGS=settings             # settings-{desktop,mobile}.png, invite-{desktop,mobile}.png
grep -rnE '#[0-9a-fA-F]{6}' frontend/src/features/settings | wc -l      # 0
docker compose exec web npm run typecheck && docker compose exec web npm run lint
make verify
```
`e2e/settings.spec.ts`: owner → choose "Reached medical records" → toast; Central chip → toast; invite `Jess Kim` → toast + copy link; open the accept link (mock token) in a fresh context → create account → lands on `/next-actions`; `/invite/expired` → friendly message; coordinator visiting `/settings` redirected. Compare with `design_handoff_simbe/screenshots/15-settings.png`. Branch `lane/F-SETTINGS-<slug>`; `bin/pr-ownership`; paste outputs in the PR.

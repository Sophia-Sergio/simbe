# Foundation: monorepo, auth, multi-tenancy, app shell — Design

**Status:** Approved for planning · **Depends on:** nothing · **Plan:** `plans/2026-10/2026-10-14-2001-foundation.md`

## Goal
Stand up the Simbe monorepo so every later feature drops into a working, tested, Dockerized skeleton: Rails API + Postgres + React shell, with sign-in, two roles, and hard agency isolation.

## Findings
- The design (`handoff/design/README.md`) has two roles (owner, coordinator), a desktop shell (224px sidebar + 56px top bar) and a mobile shell (top bar + bottom tab bar + More sheet) with a 860px breakpoint, and fixed design tokens.
- The take-home brief requires that two agencies (Harbor, Lakeside) "must never see each other's data"; the CSVs carry no agency id (`handoff/takehome/docs/data-model.md`), so the app must tag rows itself.
- Backend is Rails (user decision), DB Postgres 16, front React + TypeScript (+ Tailwind per handoff).

## Decisions
1. **Monorepo**: `` (Rails 8, `--api`, Postgres), `frontend/` (Vite + React 18 + TS strict + Tailwind 3.4), root `docker-compose.yml` (`db`, `api`, `web`), root `Makefile`.
2. **Auth**: email + password (`has_secure_password`), server-side `auth_sessions` table, opaque token in an `HttpOnly; SameSite=Lax; Secure(in prod)` cookie `simbe_session`, 14-day expiry. CSRF defense: every non-GET request must carry `X-Requested-With: simbe` (rejected with 403 `csrf` otherwise).
3. **Roles**: `users.role` ∈ `owner | coordinator`. A coordinator user carries `coordinator_name` — the string used in `leads.coordinator` — so the coordinator's data is `leads.coordinator = user.coordinator_name`.
4. **Tenancy**: `agencies` table; every tenant table has `agency_id`. `Current.agency` comes only from the session user. `AgencyScoped` concern adds a default scope and raises when no agency is set. Other agencies' ids return **404**. An isolation spec (`spec/isolation`) iterates all routes.
5. **Agency settings**: `name`, `slug` (unique, used in MCP URL), `timezone` (IANA; UI offers Pacific/Mountain/Central/Eastern), `qualified_milestone` ∈ `application_submitted | consult_attended | records | accepted` (default `consult_attended`).
6. **API conventions**: JSON under `/api/v1`, error envelope `{error:{code,message}}`, plain-Ruby serializers.
7. **Frontend shell**: implements the handoff shell exactly (sidebar sections by role, top bar search button, snapshot pill, mobile tab bar with Owner tabs Home/Pipeline/Channels/Ask/More and Coordinator tabs Next actions/My leads/Ask, More sheet). Routes exist for every screen but render a `ComingSoon` placeholder until their feature plan lands. The prototype-only "view as" toggle is **not** built.
8. **Frontend infra**: `api/jsonRequest` + `ApiError`, TanStack Query, React Router, `useAsyncAction`, `Toast` (2.6s, dark plum, green check), `Modal`/`Sheet` primitives.
8a. **Brand**: colors, Inter + Outfit type, fully-rounded buttons/pills, 16–24px card radii and the interlocking-S logo come from `docs/design/brand.md` (simbefamily.com), not the handoff's brand values. The sidebar/auth/agent show `public/brand/simbe-mark.png` instead of the handoff's "S" tile.
9. **Quality gates**: RuboCop omakase, Brakeman, bundler-audit, `npm audit`, ESLint, `tsc --noEmit`, `boundaries:check` rake, GitHub Actions running `make verify`.

## Non-goals
Password reset email, OAuth/SSO, MFA, invitations (plan 06), real ad connectors, i18n (English only for v1).

## Acceptance criteria
1. `make up && make setup` exits 0 and `curl -fs localhost:3000/up` returns 200.
2. `make spec ARGS=spec/requests/auth_spec.rb` passes (sign in, wrong password 401, sign out, CSRF header required).
3. `make spec ARGS=spec/isolation` passes: agency A's session gets 404 for agency B's ids on every routed resource.
4. `docker compose exec web bundle exec rails boundaries:check` exits 0.
5. `make web-test` passes, including shell tests: owner nav shows Insights/Operations/Agency sections; coordinator nav shows only Today; below 860px the bottom tab bar renders.
6. `make e2e ARGS=smoke` signs in as a seeded owner and a seeded coordinator and saves desktop + mobile screenshots to `e2e/screenshots/`.
7. `make verify` exits 0.
8. `grep -rniE '#be3a5f|#9f2d4e|#fdf2f5|#1c1917' frontend/src tailwind.config.ts` prints nothing, and `test -f public/brand/simbe-mark.png` succeeds.

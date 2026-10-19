# Onboarding, settings and data sources — Design

**Status:** Approved for planning · **Depends on:** foundation, snapshot-ingest (metrics optional) · **Plan:** `plans/2026-10/2026-10-14-2012-onboarding-settings-data.md`

## Goal
A new agency can sign up, define "qualified", load its seven CSV exports with a validated review step, invite its team, and later change settings or replace the snapshot.

## Findings
- Handoff §2 (5-step sign-up wizard), §10 (Data sources + upload modal with three states), §12 (Settings), screenshots `02`, `03`, `12`, `13`, `15`. Brand/shape/logo come from `docs/design/brand.md`.
- The upload review needs exactly what the ingest report returns: files matched, duplicate rows, row-count diffs (`Leads 3,530 → 3,611 (+81)`), screener-encrypted check.
- Email delivery does not exist yet. *(Amended 2026-10-19: ad accounts, Meta/Google connections and sample spend were dropped; the exports carry no spend.)*
- Agency isolation: the signup creates a brand-new agency; nothing is shared.

## Decisions
1. **Signup** — `POST /api/v1/signup { user:{name,email,password}, agency:{name,timezone,qualified_milestone} }` creates agency + owner in one transaction, signs in (cookie) and returns `MeSerializer`. Password ≥ 10 chars. Slug = parameterized agency name, unique with numeric suffix. Duplicate email → `422 { error:{code:"email_taken"} }`. The wizard collects steps 1–2 client-side and submits at the end of step 2; steps 3–5 run authenticated. Rate-limited (Rack::Attack, 10/min/IP).
2. **Time zones offered**: Pacific `America/Los_Angeles`, Mountain `America/Denver`, Central `America/Chicago`, Eastern `America/New_York` (stored as IANA).
3. **Qualified definition** options & copy: *Submitted an application* (`application_submitted`), *Attended a consult — recommended* (`consult_attended`), *Reached medical records* (`records`), *Been accepted* (`accepted`). Settings saves immediately via `PATCH /agency` and toasts "Saved. Every number now uses this definition."
4. **(removed)** Ad connections: the `ad_connections` table, endpoints and sign-up step were dropped with ad spend.
5. **Data sources page**: CRM exports card (`Loaded <date, time in agency tz>`, seven rows each with green dot, file name and row count from `snapshots.row_counts`), primary "Upload new snapshot".
6. **Upload modal** (desktop modal / mobile bottom sheet), three states: (1) dropzone + file picker accepting `.csv` (multi-select, drag-drop, any order, matched by basename); (2) "Validating files" with a pulsing line while `POST /snapshot_uploads` runs; (3) "Review changes" rendering the report: green-checked rows (`Leads 3,530 → 3,611 (+81)`, `Duplicate rows 0`, `Files matched to <agency> 7 of 7`, `Screener answers Encrypted`), amber rows for warnings, red rows for errors (Replace disabled, each error shows file + row + message). Actions Cancel (`DELETE /snapshot_uploads/:id`) and "Replace snapshot" (`POST …/commit`, single-flight). Success toast "Snapshot replaced · no duplicates counted"; queries for metrics/leads are invalidated.
7. **Team**: `GET /api/v1/team` → `{ users:[{id,name,email,role,coordinator_name}], invitations:[{id,email,role,coordinator_name,status,expires_at,accept_url?}] }`; `POST /api/v1/invitations {email, role:"coordinator", coordinator_name}` (owner only; `coordinator_name` must match a name present in `leads.coordinator_name` for the agency, else 422 `unknown_coordinator` with the list of valid names; owners cannot invite owners in v1); `DELETE /api/v1/invitations/:id`; `GET /api/v1/invitations/:token` (public, returns agency name + email) and `POST /api/v1/invitations/:token/accept {name,password}` (public, creates the user, signs in). Tokens are random, stored as SHA-256 digests, expire in 7 days, single-use. No email provider yet: the invite response includes `accept_url` (shown with a Copy button) and `InvitationMailer` renders to `letter_opener` in dev; wiring real SMTP is a non-goal. The wizard's team step uses a free-text coordinator picker populated from `GET /api/v1/coordinator_names`.
8. **Roles in UI**: these screens are owner-only; the sign-up route is public.
9. **Single flight / errors**: every submit button uses `useAsyncAction`; validation errors render inline under fields using the API `error.code`.

## Non-goals
Email verification, password reset, SSO, real OAuth/ad syncs, billing, deleting an agency, multiple owners.

## Acceptance criteria
1. `make spec ARGS=spec/requests/signup_spec.rb spec/requests/invitations_spec.rb` passes (signup creates agency+owner and signs in; duplicate email 422; short password 422; invite → accept creates a coordinator tied to a real coordinator name; expired/used token 410; unknown coordinator 422; coordinators 403 on team routes).
2. `make spec ARGS=spec/isolation` passes with the new routes.
3. `make web-test ARGS=app/javascript/features/onboarding app/javascript/features/settings app/javascript/features/data` passes (wizard step gating, qualified radios, upload modal three states incl. error review with disabled Replace, settings toasts).
4. `make e2e ARGS=onboarding` passes: sign up a new agency, upload the Alpha CSVs in the wizard, land on a dashboard with 10 leads; screenshots `{signup-agency,signup-load-data,data-sources,upload-review,settings}-{desktop,mobile}.png` saved.
5. `grep -rniE 'localStorage|sessionStorage' app/javascript/features/onboarding` prints nothing (passwords never persisted client-side).
6. `docker compose exec web bundle exec rails boundaries:check` exits 0.

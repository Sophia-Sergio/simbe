# Onboarding, Settings and Data Sources Implementation Plan

> **Detail reference, not executed directly.** The work in this plan is sliced into parallel lanes — see [`docs/superpowers/parallel/README.md`](../../parallel/README.md). Lane plans execute specific tasks of this plan with explicit overrides (data via `AlphaScenario.load!`, hooks/kit/shell from Wave 0, per-pack route files, contract paths per `contracts/openapi`). **Layout:** the app is a Rails monolith with embedded React and backend packs ([spec 2300](../../specs/2026-10/2026-10-14-2300-rails-monolith-and-packs-design.md)); file paths here were migrated mechanically (`app/packs/<pack>/…`, `app/javascript/…`) and a lane plan's `Owns` list is authoritative. Where this plan differs from a lane plan or the contract, **the lane plan and `contracts/` win**.

> **For Cursor / OpenCode:** Implement task-by-task. Follow `docs/conventions/` and **`docs/design/brand.md`**. Layout/behavior: `handoff/design/README.md` §2, §10, §12; screenshots `02`, `03`, `12`, `13`, `15`. Stop if blocked — do not replan silently. **Commit after every task** (`feat(onboarding): task N – <title>`) after the task's tests (+ `make verify` for backend tasks).

**Goal:** Sign-up wizard, ad-account (stub) connections, validated snapshot upload UI, team invitations, Settings and Data sources screens.

**Spec:** `docs/superpowers/specs/2026-10/2026-10-14-2011-onboarding-settings-data-design.md`

**Depends on:** `2026-10-14-2001-foundation` and `2026-10-14-2003-snapshot-ingest` merged (upload API, `SnapshotUploads`, `Spend::SampleGenerator` from the metrics plan for the connect step — if metrics is not merged yet, guard with `defined?(Spend::SampleGenerator)`). **Unblocks:** nothing hard.

**Architecture:** Backend adds `SignupsController`, `InvitationsController`, `TeamController`, `AdConnectionsController`. Frontend adds `features/onboarding` (wizard), `features/data` (Data sources + `SnapshotUploader`/`UploadModal`), `features/settings`.

**Tech Stack:** Rails 8, Rack::Attack, RSpec · React 18 + TS, TanStack Query, Vitest, Playwright.

## Global Constraints
- Passwords ≥ 10 chars; never stored client-side (no `localStorage`/`sessionStorage` in `features/onboarding`).
- Invitation tokens stored as SHA-256 digests only; single-use; 7-day expiry.
- Owner-only routes except signup and invitation accept/show.
- Sign-up must not disclose whether an email exists beyond the `email_taken` response on submit.

## Review Focus
- Double-click "Create account" must not create two agencies (single-flight + unique email).
- Agency name producing an empty or duplicate slug (`"!!!"`, existing `harbor`) → valid unique slug.
- Uploading 6 files, a non-CSV, or files in a different order still produces a clear report.
- Replace snapshot clicked twice → one commit (409 handled as "already running").
- Inviting a coordinator name that doesn't exist in the data → friendly error with valid names.
- Mobile: wizard card and upload modal usable at 390px (bottom sheet).

---

## File Map

| Action | Path |
|--------|------|
| Create | `db/migrate/*_create_invitations_and_ad_connections.rb`, `app/models/{invitation,ad_connection}.rb` |
| Create | `app/controllers/api/v1/{signups,invitations,team,ad_connections,coordinator_names}_controller.rb`, `app/packs/identity/app/services/signup/create_agency.rb` |
| Create | `config/initializers/rack_attack.rb`, `app/mailers/invitation_mailer.rb` |
| Create | `spec/requests/{signup,invitations,ad_connections}_spec.rb` |
| Create | `app/javascript/api/{signup,team,data}.ts`, `app/javascript/features/onboarding/**`, `app/javascript/features/data/**`, `app/javascript/features/settings/**` |
| Modify | `config/routes.rb`, `spec/support/isolation.rb`, `app/javascript/routes/router.tsx` |
| Create | `e2e/onboarding.spec.ts` |

---

## Task 1: Signup endpoint

**Files:** Create `app/services/signup/create_agency.rb`, `app/controllers/api/v1/signups_controller.rb`, `config/initializers/rack_attack.rb`, `spec/requests/signup_spec.rb`; Modify `routes.rb`, `Gemfile` (`rack-attack`).
**Interfaces — Produces:** `POST /api/v1/signup` (public, CSRF header still required) → `201 MeSerializer` + session cookie. `Signup::CreateAgency.call(user_params:, agency_params:) → User`.

- [ ] **Step 1: Failing spec**
```ruby
require "rails_helper"
RSpec.describe "Signup", type: :request do
  let(:h) { { "X-Requested-With" => "simbe" } }
  let(:payload) { { user: { name: "Erin Walsh", email: "erin@new.test", password: "long-enough-pass" },
                    agency: { name: "New Agency!", timezone: "America/Denver", qualified_milestone: "records" } } }

  it "creates the agency and owner and signs in" do
    post "/api/v1/signup", params: payload, headers: h, as: :json
    expect(response).to have_http_status(:created)
    expect(response.parsed_body.dig("agency", "slug")).to eq("new-agency")
    expect(response.parsed_body.dig("user", "role")).to eq("owner")
    get "/api/v1/me"
    expect(response).to have_http_status(:ok)
  end

  it "suffixes duplicate slugs and survives junk names" do
    create(:agency, slug: "harbor")
    post "/api/v1/signup", params: payload.deep_merge(agency: { name: "Harbor" }), headers: h, as: :json
    expect(response.parsed_body.dig("agency", "slug")).to eq("harbor-2")
    post "/api/v1/signup", params: payload.deep_merge(user: { email: "b@new.test" }, agency: { name: "!!!" }), headers: h, as: :json
    expect(response.parsed_body.dig("agency", "slug")).to match(/\Aagency-[a-z0-9]{6}\z/)
  end

  it "rejects a taken email, short password and bad timezone" do
    create(:user, email: "erin@new.test")
    post "/api/v1/signup", params: payload, headers: h, as: :json
    expect(response.parsed_body.dig("error", "code")).to eq("email_taken")
    post "/api/v1/signup", params: payload.deep_merge(user: { email: "c@new.test", password: "short" }), headers: h, as: :json
    expect(response.parsed_body.dig("error", "code")).to eq("weak_password")
    post "/api/v1/signup", params: payload.deep_merge(user: { email: "d@new.test" }, agency: { timezone: "Mars/Base" }), headers: h, as: :json
    expect(response.parsed_body.dig("error", "code")).to eq("invalid_agency")
  end

  it "creates nothing when validation fails (transactional)" do
    expect { post "/api/v1/signup", params: payload.deep_merge(agency: { timezone: "Mars/Base" }), headers: h, as: :json }.not_to change(Agency, :count)
  end
end
```
- [ ] **Step 2:** FAIL; **Step 3:** implement: controller `skip_before_action :authenticate!`; service wraps `Agency.create!` + `User.create!(role: "owner")` in a transaction; slug: `name.parameterize.presence || "agency-#{SecureRandom.alphanumeric(6).downcase}"`, then append `-2`, `-3` … while taken; map validation errors to codes (`email_taken`, `weak_password` for length < 10, `invalid_agency`). Rack::Attack: throttle `POST /api/v1/signup` and `POST /api/v1/session` at 10/min per IP (disabled in test via `Rack::Attack.enabled = false` unless a spec toggles it; add one throttle spec).
- [ ] **Step 4:** `make spec ARGS=spec/requests/signup_spec.rb` → pass. Commit.

---

## Task 2: Invitations, team, ad connections

**Files:** Create migration, models, controllers, mailer, `spec/requests/{invitations,ad_connections}_spec.rb`; Modify `routes.rb`, `isolation.rb`.
**Interfaces — Produces:** tables `invitations(agency_id, invited_by uuid, email, role, coordinator_name, token_digest unique, expires_at, accepted_at)` and `ad_connections(agency_id, platform, status, connected_at; unique agency+platform)`; endpoints per spec decisions 4 and 7:
```
GET /api/v1/team            POST /api/v1/invitations          DELETE /api/v1/invitations/:id
GET /api/v1/invitations/:token (public)                       POST /api/v1/invitations/:token/accept (public)
GET /api/v1/coordinator_names                                   GET/POST /api/v1/ad_connections    DELETE /api/v1/ad_connections/:platform
```
`Invitation.issue!(agency:, invited_by:, email:, coordinator_name:) → [invitation, raw_token]`; `accept_url` = `"#{ENV.fetch('APP_URL', 'http://localhost:5173')}/invite/#{raw_token}"` (returned only on create).

- [ ] **Step 1: Failing specs**
```ruby
RSpec.describe "Invitations", type: :request do
  let(:h) { { "X-Requested-With" => "simbe" } }
  let(:agency) { create(:agency, slug: "alpha") }
  let!(:owner) { create(:user, agency: agency) }
  before { Current.agency = agency; Snapshot::Importer.call(agency: agency, dir: AlphaScenario.copy_dir); Current.reset }
  def sign_in(u) = post("/api/v1/session", params: { email: u.email, password: "secret-pass-1" }, headers: h, as: :json)

  it "invites a coordinator tied to a real coordinator name and accepts the invite" do
    sign_in(owner)
    post "/api/v1/invitations", params: { email: "maya@alpha.test", coordinator_name: "Jess Kim" }, headers: h, as: :json
    expect(response).to have_http_status(:created)
    url = response.parsed_body["accept_url"]; token = url.split("/").last
    delete "/api/v1/session", headers: h
    get "/api/v1/invitations/#{token}"
    expect(response.parsed_body).to include("agency_name" => agency.name, "email" => "maya@alpha.test")
    post "/api/v1/invitations/#{token}/accept", params: { name: "Maya Chen", password: "long-enough-pass" }, headers: h, as: :json
    expect(response).to have_http_status(:created)
    expect(response.parsed_body["user"]).to include("role" => "coordinator", "coordinator_name" => "Jess Kim")
    post "/api/v1/invitations/#{token}/accept", params: { name: "x", password: "long-enough-pass" }, headers: h, as: :json
    expect(response).to have_http_status(:gone)
  end
  it "rejects unknown coordinator names with the valid list" do
    sign_in(owner)
    post "/api/v1/invitations", params: { email: "x@alpha.test", coordinator_name: "Nobody" }, headers: h, as: :json
    expect(response).to have_http_status(:unprocessable_entity)
    expect(response.parsed_body.dig("error", "code")).to eq("unknown_coordinator")
    expect(response.parsed_body["valid_names"]).to match_array(["Dana Ortiz", "Jess Kim", "Priya Shah"])
  end
  it "410s an expired token" do
    sign_in(owner)
    post "/api/v1/invitations", params: { email: "e@alpha.test", coordinator_name: "Jess Kim" }, headers: h, as: :json
    token = response.parsed_body["accept_url"].split("/").last
    travel_to(8.days.from_now) { get "/api/v1/invitations/#{token}"; expect(response).to have_http_status(:gone) }
  end
  it "forbids coordinators on team routes and 404s another agency's invitation delete" do
    coord = create(:user, :coordinator, agency: agency); sign_in(coord)
    get "/api/v1/team"; expect(response).to have_http_status(:forbidden)
  end
  it "lists users and pending invitations" do
    sign_in(owner)
    post "/api/v1/invitations", params: { email: "p@alpha.test", coordinator_name: "Dana Ortiz" }, headers: h, as: :json
    get "/api/v1/team"
    expect(response.parsed_body["users"].size).to eq(1)
    expect(response.parsed_body["invitations"].first).to include("email" => "p@alpha.test", "status" => "pending")
  end
end
RSpec.describe "Ad connections", type: :request do
  it "connects and disconnects a platform and creates sample spend once" do
    # owner: POST {platform:"meta"} → 201 status connected; AdSpendDay sample rows exist; POST again → 200 (idempotent, no duplicate rows); DELETE → 204; invalid platform → 422; coordinator 403
  end
end
```
- [ ] **Step 2:** FAIL; **Step 3:** implement (digest with `OpenSSL::Digest::SHA256`; accept: transaction creating `User(role coordinator)`, marking `accepted_at`, signing in; `InvitationMailer.invite(invitation, accept_url).deliver_later` with a plain-text template; `Rails.application.config.action_mailer.delivery_method = :letter_opener` in dev only). `coordinator_names` = `Lead.distinct.order(:coordinator_name).pluck(:coordinator_name).compact`. Ad connection create calls `Spend::SampleGenerator.call(agency:)` inside `if defined?(Spend::SampleGenerator) && Lead.exists?`.
- [ ] **Step 4:** append to `ISOLATION_ROUTES` (`/api/v1/team`, `/api/v1/invitations/:id` DELETE, `/api/v1/ad_connections`, `/api/v1/coordinator_names`); `make spec ARGS="spec/requests spec/isolation"` pass; `rails boundaries:check` ok. Commit.

---

## Task 3: Frontend data layer, wizard shell, steps 1–2

**Files:** Create `app/javascript/api/{signup,team,data}.ts`, `app/javascript/features/onboarding/{SignUpPage,WizardShell,Stepper,steps/AccountStep,steps/AgencyStep}.tsx`, tests; Modify `router.tsx` (`/signup` public).
**Interfaces — Produces:** `signup(payload)`, `useTeam()`, `useInviteCoordinator()`, `useAdConnections()`, `useConnectPlatform()`, `useCurrentSnapshot()`; constants `TIMEZONES = [{label:"Pacific", value:"America/Los_Angeles"}, …]`, `QUALIFIED_OPTIONS = [{value, title, description, recommended?}]` in `app/javascript/features/agency/options.ts` (shared with Settings).

- [ ] **Step 1: Failing tests**
```tsx
it("disables Continue until the account step is valid", async () => {
  render(<SignUpPage />);
  const cont = screen.getByRole("button", { name: "Continue" });
  expect(cont).toBeDisabled();
  await userEvent.type(screen.getByLabelText("Your name"), "Erin Walsh");
  await userEvent.type(screen.getByLabelText("Work email"), "erin@new.test");
  await userEvent.type(screen.getByLabelText("Password"), "short");
  expect(cont).toBeDisabled();
  await userEvent.clear(screen.getByLabelText("Password"));
  await userEvent.type(screen.getByLabelText("Password"), "long-enough-pass");
  expect(cont).toBeEnabled();
});
it("submits account+agency at the end of step 2 and moves to Ad accounts", async () => {
  /* fill step 1, Continue; step 2: agency name, click 'Mountain', radio 'Reached medical records'; Continue → POST /api/v1/signup body; then shows 'Connect your ad accounts' */
});
it("shows email_taken on step 2 and returns the user to step 1 with the message", async () => { /* 422 */ });
it("recommended radio is preselected and selected card uses the brand ring", () => { /* consult_attended checked, label 'recommended' */ });
it("Stepper marks completed steps with a check", () => { /* ... */ });
it("double-clicking Continue on step 2 posts once", async () => { /* fetch called once */ });
```
- [ ] **Step 2:** FAIL; **Step 3:** implement per handoff §2: wizard card max 600px `rounded-modal`; header strip `bg-app` with five 22px numbered dots (current `bg-brand` white number, done `bg-success` ✓, upcoming white + border) and labels (Account, Agency, Ad accounts, Load data, Team); body padding `28px 24px`, title (`font-display` 21px) + subtitle; footer bar Back (secondary) / Continue (primary). Logo mark 40px above the strip on the page. Time-zone chips `rounded-full` (selected `bg-brand-tint border-brand-border`); qualified radio cards (selected `bg-brand-tint border-brand-border`, radio with 5px brand ring). After a successful signup set auth state (`AuthProvider.setSession`) so later steps are authenticated.
- [ ] **Step 4:** pass. Visual check vs `02-signup-agency.png`. Commit.

---

## Task 4: SnapshotUploader, UploadModal and Data sources page

**Files:** Create `app/javascript/features/data/{SnapshotUploader,UploadModal,ReviewReport,FileList,DataSourcesPage}.tsx`, tests; Modify `router.tsx` (`/data`).
**Interfaces — Produces:** `useSnapshotUpload()` → `{ state: "idle"|"validating"|"review"|"committing"|"done"|"error", files, report, upload(files), commit(), cancel() }`; `<SnapshotUploader onReport />` (dropzone + picker, shared by the wizard step and the modal); `<ReviewReport report agencyName />`.
Report row mapping (`ReviewReport`): `Leads {current} → {incoming} (+{delta})` (success), `Duplicate rows {n}` (success when 0 else danger), `Files matched to {agency} {x of 7}` (success when 7 of 7), `Screener answers Encrypted` (success), each warning → amber row `message (count)`, each error → red row `file row message`. `Replace snapshot` disabled when `report.ok === false`.

- [ ] **Step 1: Failing tests**
```tsx
it("walks dropzone → validating → review and commits", async () => {
  mockApi({ "POST /api/v1/snapshot_uploads": { id: "u1", report: okReport }, "POST /api/v1/snapshot_uploads/u1/commit": { snapshot: snapFixture } });
  render(<UploadModal open onClose={vi.fn()} agencyName="Harbor Surrogacy" />);
  await userEvent.upload(screen.getByLabelText(/csv files/i), sevenCsvFiles());
  expect(await screen.findByText("Validating files")).toBeInTheDocument();
  expect(await screen.findByText("Review changes")).toBeInTheDocument();
  expect(screen.getByText("Leads 3,530 → 3,611 (+81)")).toBeInTheDocument();
  expect(screen.getByText("Files matched to Harbor Surrogacy 7 of 7")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Replace snapshot" }));
  expect(await screen.findByText("Snapshot replaced · no duplicates counted")).toBeInTheDocument();
});
it("blocks Replace and lists errors when the report has errors", async () => { /* ok:false with duplicate_key error → disabled button + 'stage_history.csv row 12' */ });
it("Cancel deletes the pending upload", async () => { /* DELETE /snapshot_uploads/u1 */ });
it("Replace snapshot is single-flight and handles 409", async () => { /* two clicks → one POST; 409 → 'A load is already running' */ });
it("is a bottom sheet under 860px", () => { setViewport(390); /* role=dialog has data-variant=sheet */ });
it("DataSourcesPage shows connector cards and the seven CRM rows with counts", async () => { /* '3,530', 'leads.csv', 'Loaded Oct 1, 2026 · 9:14 am' in agency tz */ });
it("Connect on a connector card calls the API and shows Connected", async () => { /* POST ad_connections */ });
```
- [ ] **Step 2:** FAIL; **Step 3:** implement per handoff §10 (dropzone dashed `border-line-strong`, `rounded-card`; "Validating files" pulsing 2px line via CSS animation; review rows with icons; Cancel/Replace actions). Files with the wrong basename are listed under "Ignored: …". After commit: invalidate `["metrics"]`, `["leads"]`, `["next_actions"]`, `["snapshot"]`.
- [ ] **Step 4:** pass. Visual check vs `12-data-sources.png`, `13-upload-review.png`. Commit.

---

## Task 5: Wizard steps 3–5 and finish

**Files:** Create `steps/{AdAccountsStep,LoadDataStep,TeamStep}.tsx`, tests; Modify `SignUpPage.tsx`.

- [ ] **Step 1: Failing tests**
```tsx
it("ad accounts step connects Meta and Google and is skippable", async () => {
  /* two rows with logo tiles; click Connect → button becomes green 'Connected'; 'Continue' enabled regardless */
});
it("load data step lists the seven files with Loaded/Waiting pills as they validate", async () => {
  /* picks files → rows flip to Loaded; shield note 'Screener answers are encrypted'; Continue allowed when a snapshot was committed or user clicks 'Skip for now' */
});
it("team step invites by email + coordinator and lists the owner and the invitation", async () => {
  /* POST /invitations; list shows Owner (brand pill) and Invited (amber pill); copy-link button copies accept_url */
});
it("unknown coordinator shows the valid names", async () => { /* 422 → inline 'Pick one of: Dana Ortiz, Jess Kim' */ });
it("final CTA 'Open my dashboard' routes to '/'", async () => { /* ... */ });
```
- [ ] **Step 2:** FAIL; **Step 3:** implement per handoff §2.3–2.5 (38px logo tiles, Connect primary → green "Connected" pill-button, seven-file list with status dots, shield note, Team input + Invite + list with avatars and role pills). Wizard step 4 commits the snapshot via the same `useSnapshotUpload` (review state shown inline with Replace → "Load data").
- [ ] **Step 4:** pass. Visual check vs `03-signup-load-data.png`. Commit.

---

## Task 6: Settings page and invite acceptance page

**Files:** Create `app/javascript/features/settings/{SettingsPage,QualifiedCards,TimezoneChips,TeamCard}.tsx`, `app/javascript/features/onboarding/AcceptInvitePage.tsx`, tests; Modify `router.tsx` (`/settings`, `/invite/:token` public).

- [ ] **Step 1: Failing tests**
```tsx
it("changing the qualified definition saves immediately with the handoff toast", async () => {
  mockApi({ "PATCH /api/v1/agency": agencyFixture, "GET /api/v1/team": teamFixture });
  render(<SettingsPage />);
  await userEvent.click(screen.getByRole("radio", { name: /reached medical records/i }));
  expect(await screen.findByText("Saved. Every number now uses this definition.")).toBeInTheDocument();
  expect(patchBody()).toEqual({ qualified_milestone: "records" });
});
it("timezone chips save and toast", async () => { /* 'Central' → PATCH timezone America/Chicago */ });
it("invite sends and toasts 'Invitation sent'", async () => { /* ... */ });
it("accept-invite page shows the agency and creates the account", async () => { /* GET /invitations/:token, POST accept, then redirect to /next-actions */ });
it("expired invite shows a friendly message", async () => { /* 410 → 'This invitation has expired. Ask your agency owner for a new one.' */ });
it("is max 720px wide and three cards", () => { /* snapshot of structure: 3 headings */ });
```
- [ ] **Step 2:** FAIL; **Step 3:** implement per handoff §12 (max-w 720px; cards: Definition of qualified, Time zone, Team with role pills and invite footer `bg-app`). Optimistic update of `["me"]` agency; invalidates `["metrics"]` and `["leads"]`.
- [ ] **Step 4:** pass. Visual check vs `15-settings.png`. Commit.

---

## Task 7: E2E and final verification

**Files:** Create `e2e/onboarding.spec.ts`; Modify `lib/tasks/e2e.rake` (add `e2e:alpha_files` that writes the Alpha CSVs to `e2e/fixtures/alpha/`, git-ignored).

- [ ] **Step 1:** Playwright: visit `/signup`, create "E2E Agency" (Pacific, records definition), skip ad accounts, upload the seven Alpha CSVs, review shows `Leads 0 → 10 (+10)`, Replace, then team step invite `Jess Kim`, "Open my dashboard" → `/` shows `10` leads; Settings → switch to "Attended a consult" and the KPI qualified changes (3). Screenshots at 1280×800 and 390×844.
- [ ] **Step 2:** `docker compose exec web bundle exec rails e2e:alpha_files && make e2e ARGS=onboarding` → pass.
- [ ] **Step 3:** `grep -rniE 'localStorage|sessionStorage' app/javascript/features/onboarding` prints nothing.
- [ ] **Step 4:** `make verify` → exit 0. Commit; open PR.

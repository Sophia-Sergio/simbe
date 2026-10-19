import type { Page } from "@playwright/test"

// The audit inventory (plan 2162 task 1): every route, its role and a ready-state selector. The audit
// spec loops this list × the nine widths below. `drive` reaches URL-independent states (wizard step,
// overlay, upload modal); it runs once per screen, then the spec resizes to every width.

/** Phone, tablet, breakpoint edges and desktop (plan 2162 global constraints). */
export const WIDTHS = [360, 390, 430, 768, 859, 860, 1024, 1280, 1440] as const

/** The shell that must be mounted at a width: mobile `<860`, desktop `>=860`. */
export const shellAt = (width: number): "mobile" | "desktop" => (width >= 860 ? "desktop" : "mobile")

export type ScreenRole = "public" | "owner" | "coordinator"

export type Screen = {
  /** stable id used in the report matrix */
  id: string
  /** URL path (plus `?mock=` scenario where the screen is mock-only) */
  path: string
  /** override when the real API has no `?mock=` scenario and the URL differs */
  realPath?: string
  role: ScreenRole
  /** Playwright selector proving the screen (and its data) have settled */
  ready: string
  /** Only exists on the standalone mock host / dev build (`?mock=` states, the kit gallery). */
  mockOnly?: boolean
  /** Drives a state that is not URL-addressable (wizard step, overlay, upload modal). */
  drive?: (page: Page, id: string) => Promise<void>
  /** A stateful drive (a server-side pending upload) is driven once, at the first width. */
  driveOnce?: boolean
  notes?: string
}

/** Dana Ortiz's lead in the Alpha fixtures (see e2e/lead-panel.spec.ts). */
const LEAD_L4 = "aaaaaaaa-0000-4000-8000-000000000004"

const EXPORT_FILES = [
  "leads.csv",
  "stage_history.csv",
  "contact_log.csv",
  "screener_answers.csv",
  "web_sessions.csv",
  "appointments.csv",
  "applications.csv",
]

const csv = (name: string) => ({ name, mimeType: "text/csv", buffer: Buffer.from("id,source\n1,fb\n") })

// --- drive helpers ---------------------------------------------------------------------------------

const currentWidth = (page: Page) => page.viewportSize()?.width ?? 1280

/** Step 1 of the wizard is already on screen; this just proves the account step can be left. */
async function fillAccount(page: Page, id: string) {
  await page.getByLabel("Your name").fill("Erin Walsh")
  // A unique address per audited step: the mock API keeps the account it created and would answer
  // "that email already has an account" to a second sign-up with the same one.
  await page.getByLabel("Work email").fill(`${id}@harbor.test`)
  await page.getByLabel("Password").fill("long-enough-pass")
  await page.getByRole("button", { name: "Continue" }).click()
}

async function toStep3(page: Page, id: string) {
  await fillAccount(page, id)
  await page.getByLabel("Agency name").fill("Audit demo")
  await page.getByRole("button", { name: "Pacific" }).click()
  await page.getByRole("button", { name: "Continue" }).click()
}

async function toStep4(page: Page, id: string) {
  await toStep3(page, id)
  await page.getByLabel("CSV files").setInputFiles(EXPORT_FILES.map(csv))
  await page.getByText("Review changes").waitFor({ timeout: 30_000 })
  await page.getByRole("button", { name: "Load data" }).click()
  await page.getByText("Your data is loaded").waitFor({ timeout: 30_000 })
  await page.getByRole("button", { name: "Continue" }).click()
}

/** Opens the "Ask Simbe" panel the way each shell does: FAB on desktop, the Ask tab on a phone. */
async function openAgent(page: Page) {
  const trigger =
    currentWidth(page) >= 860
      ? page.getByRole("button", { name: "Ask Simbe" })
      : page.getByRole("button", { name: "Ask", exact: true })
  await trigger.waitFor({ state: "visible" })
  await trigger.click()
}

/** Opens the ⌘K palette the way each shell does: the chord on desktop, the top-bar icon on a phone. */
async function openSearch(page: Page) {
  if (currentWidth(page) >= 860) await page.keyboard.press("Control+k")
  else await page.getByRole("button", { name: "Search candidates" }).click()
}

const openUpload = (page: Page) => page.getByRole("button", { name: "Upload new snapshot" }).click()

async function uploadAndReview(page: Page) {
  await openUpload(page)
  await page.getByLabel("CSV files").setInputFiles(EXPORT_FILES.map(csv))
  await page.getByText("Review changes").waitFor({ timeout: 30_000 })
}

// --- the screens -----------------------------------------------------------------------------------

export const screens: Screen[] = [
  // Public: no session.
  { id: "signin", path: "/signin", role: "public", ready: "text=Welcome back" },
  { id: "signup-account", path: "/signup?mock=new", realPath: "/signup", role: "public", ready: "text=Create your account", notes: "wizard step 1" },
  { id: "signup-agency", path: "/signup?mock=new", role: "public", ready: "text=Set up your agency", mockOnly: true, drive: fillAccount, notes: "wizard step 2" },
  { id: "signup-load-data", path: "/signup?mock=new", role: "public", ready: "text=Load your data", mockOnly: true, drive: toStep3, notes: "wizard step 3" },
  { id: "signup-invite", path: "/signup?mock=new", role: "public", ready: "text=Invite your team", mockOnly: true, drive: toStep4, notes: "wizard step 4" },
  { id: "invite", path: "/invite/mock-token", role: "public", ready: "text=Your name", mockOnly: true, notes: "accept invitation" },
  { id: "invite-expired", path: "/invite/expired", role: "public", ready: "text=This invitation has expired" },
  { id: "kit", path: "/__kit", role: "public", ready: "h1:has-text('Kit')", mockOnly: true, notes: "dev/e2e gallery only (absent from a production build)" },

  // Owner.
  { id: "week", path: "/", role: "owner", ready: "main h1" },
  { id: "week-empty", path: "/?mock=empty", role: "owner", ready: "text=No data yet", mockOnly: true },
  { id: "funnel", path: "/funnel", role: "owner", ready: "text=Inquiry" },
  { id: "channels", path: "/channels", role: "owner", ready: "text=Facebook" },
  { id: "channel-facebook", path: "/channels/Facebook", role: "owner", ready: "text=Campaigns" },
  { id: "pipeline", path: "/pipeline", role: "owner", ready: 'section[aria-label="Action needed"]' },
  { id: "pipeline-list", path: "/pipeline?view=list", role: "owner", ready: 'input[aria-label="Filter leads"]' },
  { id: "pipeline-lead-summary", path: `/pipeline?lead=${LEAD_L4}&tab=summary`, realPath: `/pipeline?lead=${LEAD_L4}&tab=summary`, role: "owner", ready: '[role="dialog"]:has-text("L4 Alpha")', notes: "lead panel open; the ready selector rejects the not-found dialog" },
  { id: "pipeline-lead-screener", path: `/pipeline?lead=${LEAD_L4}&tab=screener`, realPath: `/pipeline?lead=${LEAD_L4}&tab=screener`, role: "owner", ready: '[role="dialog"]:has-text("L4 Alpha")', notes: "lead panel open; the ready selector rejects the not-found dialog" },
  { id: "pipeline-lead-activity", path: `/pipeline?lead=${LEAD_L4}&tab=activity`, realPath: `/pipeline?lead=${LEAD_L4}&tab=activity`, role: "owner", ready: '[role="dialog"]:has-text("L4 Alpha")', notes: "lead panel open; the ready selector rejects the not-found dialog" },
  { id: "pipeline-lead-source", path: `/pipeline?lead=${LEAD_L4}&tab=source`, realPath: `/pipeline?lead=${LEAD_L4}&tab=source`, role: "owner", ready: '[role="dialog"]:has-text("L4 Alpha")', notes: "lead panel open; the ready selector rejects the not-found dialog" },
  { id: "pipeline-loading", path: "/pipeline?mock=loading", role: "owner", ready: "text=Loading your data", mockOnly: true },
  { id: "pipeline-empty", path: "/pipeline?mock=empty", role: "owner", ready: "text=Load your data", mockOnly: true },
  { id: "coordinators", path: "/coordinators", role: "owner", ready: "text=Dana Ortiz" },
  { id: "coordinator-dana", path: "/coordinators/Dana%20Ortiz", role: "owner", ready: "main h1" },
  { id: "data", path: "/data", role: "owner", ready: "text=Loaded" },
  { id: "data-upload", path: "/data", role: "owner", ready: '[role="dialog"]', drive: openUpload, notes: "upload modal open" },
  { id: "data-upload-review", path: "/data", role: "owner", ready: "text=Review changes", mockOnly: true, drive: uploadAndReview, driveOnce: true, notes: "upload modal, review state" },
  { id: "connect", path: "/connect", role: "owner", ready: "text=Server URL" },
  { id: "settings", path: "/settings", role: "owner", ready: "text=Definition of qualified" },
  { id: "agent-panel", path: "/", role: "owner", ready: '[role="dialog"]', drive: openAgent, notes: "Ask Simbe open" },
  { id: "search-palette", path: "/", role: "owner", ready: '[role="dialog"]', drive: openSearch, notes: "⌘K palette open" },

  // Coordinator.
  { id: "next-actions", path: "/next-actions", role: "coordinator", ready: "main h1" },
  { id: "next-actions-empty", path: "/next-actions?mock=empty", role: "coordinator", ready: "text=Ask your agency owner to load data", mockOnly: true },
  { id: "pipeline-coordinator", path: "/pipeline", role: "coordinator", ready: 'section[aria-label="Action needed"]' },
  { id: "pipeline-coordinator-screener", path: `/pipeline?lead=${LEAD_L4}&tab=screener`, realPath: `/pipeline?lead=${LEAD_L4}&tab=screener`, role: "coordinator", ready: '[role="dialog"]:has-text("L4 Alpha")', notes: "coordinator sees raw answers; the ready selector rejects the not-found dialog" },
]

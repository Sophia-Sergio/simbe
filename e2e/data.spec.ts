import { expect, test } from "@playwright/test"
import type { Page } from "@playwright/test"

// Runs against the standalone mock host (`npm run dev:mock`): no Rails, no Docker. Screenshots land in
// e2e/screenshots for the PR's visual check against handoff/design/screenshots/12-data-sources.png and 13-upload-review.png.
const OWNER = "erin@harbor.test"
const COORDINATOR = "dana@harbor.test"

const FILES = [
  "leads.csv",
  "stage_history.csv",
  "contact_log.csv",
  "screener_answers.csv",
  "web_sessions.csv",
  "appointments.csv",
  "applications.csv",
]
const SIX = FILES.filter((name) => name !== "appointments.csv")

const csv = (name: string) => ({ name, mimeType: "text/csv", buffer: Buffer.from("id,source\n1,fb\n") })

const isDesktop = (page: Page) => (page.viewportSize()?.width ?? 0) >= 860
const shot = (page: Page, name: string) => `e2e/screenshots/${name}-${isDesktop(page) ? "desktop" : "mobile"}.png`
const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)

async function signIn(page: Page, email: string) {
  await page.goto("/signin")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill("x")
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page.locator("[data-shell]")).toBeVisible({ timeout: 15_000 })
}

test("owner: the seven CRM rows", async ({ page }) => {
  await signIn(page, OWNER)
  await page.goto("/data")

  await expect(page.getByRole("main").getByRole("heading", { name: "Data sources" })).toBeVisible()

  for (const name of FILES) await expect(page.getByText(name, { exact: true })).toBeVisible()
  await expect(page.getByText("3,530 rows")).toBeVisible()
  await expect(page.getByText("35,300 rows")).toBeVisible()
  await expect(page.getByText("Loaded Oct 1, 2026 · 9:14 am")).toBeVisible()

  // Mobile acceptance: no horizontal scroll.
  expect(await noHorizontalScroll(page)).toBe(true)
  await page.screenshot({ path: shot(page, "data-sources") })
})

test("owner: upload seven files, review the changes and replace the snapshot", async ({ page }) => {
  await signIn(page, OWNER)
  await page.goto("/data")
  await page.getByRole("button", { name: "Upload new snapshot" }).click()

  const dialog = page.getByRole("dialog")
  await expect(dialog).toContainText("Drop your 7 CSV exports")

  await page.getByLabel("CSV files").setInputFiles(FILES.map(csv))
  // Validating: the pulsing progress line plus the checklist of the seven files.
  await expect(dialog.getByRole("progressbar")).toBeVisible()
  await expect(dialog).toContainText("leads.csv")

  await expect(dialog).toContainText("Review changes", { timeout: 20_000 })
  await expect(dialog).toContainText("Leads 3,530 → 3,611 (+81)")
  await expect(dialog).toContainText("Files matched to Harbor Surrogacy 7 of 7")
  await page.screenshot({ path: shot(page, "upload-review") })

  await page.getByRole("button", { name: "Replace snapshot" }).click()
  // Committing: no Cancel once the replace is running.
  await expect(dialog.getByRole("progressbar")).toBeVisible()
  await expect(page.getByRole("button", { name: "Cancel" })).toHaveCount(0)

  await expect(page.getByTestId("toast")).toContainText("Snapshot replaced · no duplicates counted", { timeout: 20_000 })
  await expect(dialog).toHaveCount(0)
  await expect(page.getByText("3,611 rows")).toBeVisible()
})

test("owner: closing the modal mid-load keeps the page loading and reopens the same upload", async ({ page }) => {
  await signIn(page, OWNER)
  await page.goto("/data")
  await page.getByRole("button", { name: "Upload new snapshot" }).click()
  await page.getByLabel("CSV files").setInputFiles(FILES.map(csv))

  await page.getByRole("button", { name: "Close" }).click()
  // The load continues: the CRM card shows the pending strip.
  const crm = page.getByTestId("crm-exports")
  await expect(crm).toContainText(/Loading your data/)

  // Reopening resumes the same upload instead of starting over.
  await page.getByRole("button", { name: "Upload new snapshot" }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog).toContainText("Review changes", { timeout: 20_000 })

  await page.getByRole("button", { name: "Cancel" }).click()
  await expect(dialog).toHaveCount(0)
})

test("owner: a six-file upload lists errors, disables Replace and cancels cleanly", async ({ page }) => {
  await signIn(page, OWNER)
  await page.goto("/data")
  await page.getByRole("button", { name: "Upload new snapshot" }).click()
  await page.getByLabel("CSV files").setInputFiles(SIX.map(csv))

  const dialog = page.getByRole("dialog")
  await expect(dialog).toContainText("Review changes", { timeout: 20_000 })
  await expect(dialog).toContainText("appointments.csv was not uploaded")
  await expect(page.getByRole("button", { name: "Replace snapshot" })).toBeDisabled()

  await page.getByRole("button", { name: "Cancel" }).click()
  await expect(dialog).toHaveCount(0)
})

test("owner: an agency with no snapshot sees the empty state", async ({ page }) => {
  await signIn(page, OWNER)
  await page.goto("/data?mock=empty")
  await expect(page.getByText("No data loaded yet")).toBeVisible()
  await expect(page.getByTestId("crm-exports").getByRole("button", { name: "Upload new snapshot" })).toBeVisible()
})

test("a coordinator is redirected away from Data sources", async ({ page }) => {
  await signIn(page, COORDINATOR)
  await page.goto("/data")
  await expect.poll(() => new URL(page.url()).pathname).toBe("/next-actions")
  await expect(page.getByRole("link", { name: "Data sources" })).toHaveCount(0)
})

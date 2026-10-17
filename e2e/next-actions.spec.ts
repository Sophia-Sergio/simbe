import { expect, test } from "@playwright/test"
import type { Page } from "@playwright/test"

// Coordinator home ("Next actions"), mock mode. No Rails, no Docker: `npm run dev:mock` serves the
// app + MSW. Screenshots land in e2e/screenshots for the PR's visual check against
// handoff/design/screenshots/16-coordinator-next-actions.png.
const COORDINATOR = "dana@harbor.test"
const OWNER = "erin@harbor.test"

const isDesktop = (page: Page) => (page.viewportSize()?.width ?? 0) >= 860
const shotFor = (page: Page) => `e2e/screenshots/next-actions-${isDesktop(page) ? "desktop" : "mobile"}.png`

async function signIn(page: Page, email: string, query = "") {
  await page.goto(`/signin${query}`)
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill("x")
  await page.getByRole("button", { name: "Sign in" }).click()
  // Wait for the authenticated shell: navigating away before the session resolves would drop it.
  await expect(page.locator("[data-shell]")).toBeVisible()
}

test("coordinator lands on Next actions, works a task and opens the lead panel", async ({ page }) => {
  await signIn(page, COORDINATOR)

  // SignInPage sends a coordinator home to /next-actions.
  await expect(page).toHaveURL(/\/next-actions$/)
  await expect(page.getByRole("heading", { name: "Next actions" })).toBeVisible()
  // Dana's three open items (L4 nudge, L3 rebook, L10 paused); the text-back queue is empty for her.
  await expect(page.getByText("3 open", { exact: true })).toBeVisible()
  await expect(page.getByText("0 / 3", { exact: true })).toBeVisible()
  await expect(page.getByText(/most urgent first/)).toBeVisible()

  const nudge = page.getByRole("region", { name: "Nudge applications" })
  await expect(nudge.getByText("L4 Alpha")).toBeVisible()
  if (isDesktop(page)) {
    // The whole board is on screen at 1280px; the phone shows one queue at a time behind chips.
    await expect(page.getByRole("region", { name: "Rebook consults" }).getByText("L3 Alpha")).toBeVisible()
    await expect(page.getByRole("region", { name: "Paused, due back" }).getByText("L10 Alpha")).toBeVisible()
    await expect(page.getByRole("region", { name: "Text back now" })).toContainText("Nothing here")
  }

  // Done: header and progress move immediately, the card dims and reads Undo.
  await nudge.getByRole("button", { name: "Done" }).click()
  await expect(page.getByText("2 open", { exact: true })).toBeVisible()
  await expect(page.getByText("1 / 3", { exact: true })).toBeVisible()
  await expect(nudge.getByRole("button", { name: "Undo" })).toBeVisible()
  await expect(nudge.getByTestId("task-card")).toHaveClass(/opacity-50/)

  await page.screenshot({ path: shotFor(page) })

  // Undo restores the day.
  await nudge.getByRole("button", { name: "Undo" }).click()
  await expect(page.getByText("3 open", { exact: true })).toBeVisible()
  await expect(page.getByText("0 / 3", { exact: true })).toBeVisible()
  await expect(nudge.getByRole("button", { name: "Done" })).toBeVisible()

  // Clicking the card body opens the lead panel (the panel itself is the F-LEADPANEL lane).
  await nudge.getByText("L4 Alpha").click()
  await expect(page).toHaveURL(/lead=aaaaaaaa-0000-4000-8000-000000000004/)
})

test("owner is redirected away from the coordinator home", async ({ page }) => {
  await signIn(page, OWNER)
  await page.goto("/next-actions")

  // RequireRole sends the owner home once the session resolves.
  await expect.poll(() => new URL(page.url()).pathname).toBe("/")
  await expect(page.getByRole("link", { name: "Next actions" })).toHaveCount(0)
})

test("shows Loading your data while a snapshot import is in flight", async ({ page }) => {
  await signIn(page, COORDINATOR, "?mock=loading")

  await expect(page.getByText(/Loading your data/)).toBeVisible()
})

test("a coordinator with no snapshot is told to ask the agency owner", async ({ page }) => {
  await signIn(page, COORDINATOR, "?mock=empty")

  await expect(page.getByText("Ask your agency owner to load data.")).toBeVisible()
})

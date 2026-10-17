import { expect, test } from "@playwright/test"
import type { Page } from "@playwright/test"

// Runs against the standalone mock host (`npm run dev:mock`): no Rails, no Docker. The backend lane
// (B-ACTIONS) lands the real endpoints in W3-1; here the mock API serves the contract fixtures.
// Screenshots land in e2e/screenshots for the PR's visual check against
// handoff/design/screenshots/11-coordinators.png.
const OWNER = "erin@harbor.test"
const COORDINATOR = "dana@harbor.test"
const L4 = "aaaaaaaa-0000-4000-8000-000000000004"

const isDesktop = (page: Page) => (page.viewportSize()?.width ?? 0) >= 860
const shot = (page: Page, name: string) => `e2e/screenshots/${name}-${isDesktop(page) ? "desktop" : "mobile"}.png`

async function signIn(page: Page, email: string, query = "") {
  await page.goto(`/signin${query}`)
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill("x")
  await page.getByRole("button", { name: "Sign in" }).click()
  // Wait for the authenticated shell: navigating away before the session resolves would drop it.
  await expect(page.locator("[data-shell]")).toBeVisible()
}

const noHorizontalScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)

test("owner: coordinator cards, status pills, footnote and the detail", async ({ page }) => {
  await signIn(page, OWNER)
  await page.goto("/coordinators")

  for (const name of ["Dana Ortiz", "Jess Kim", "Priya Shah"]) {
    await expect(page.getByText(name, { exact: true })).toBeVisible()
  }
  await expect(page.getByText("Owner only")).toBeVisible()
  await expect(page.getByText(/can reflect lead mix as well as effort/i)).toBeVisible()
  // Mobile acceptance: single-column cards and no horizontal scroll.
  expect(await noHorizontalScroll(page)).toBe(true)
  await page.screenshot({ path: shot(page, "coordinators") })

  // The card links to the URL-encoded detail page.
  await page.getByRole("link", { name: /Dana Ortiz/ }).click()
  await expect(page).toHaveURL(/coordinators\/Dana(%20|\s)Ortiz/)
  await expect(page.getByRole("heading", { name: "Dana Ortiz" })).toBeVisible()
  // Detail: the 4 KPIs and the needs-action list from the contract fixture.
  await expect(page.getByText("Qualified rate")).toBeVisible()
  await expect(page.getByText("23m")).toBeVisible()
  await expect(page.getByText("L4 Alpha")).toBeVisible()
  expect(await noHorizontalScroll(page)).toBe(true)
  await page.screenshot({ path: shot(page, "coordinator-detail") })

  // A needs-action row opens the lead panel (the panel itself is the F-LEADPANEL lane).
  await page.getByText("L4 Alpha").click()
  await expect(page).toHaveURL(new RegExp(`lead=${L4}`))
})

test("owner: the loading and empty data states", async ({ page }) => {
  await signIn(page, OWNER)

  await page.goto("/coordinators?mock=loading")
  await expect(page.getByText(/Loading your data/)).toBeVisible()

  await page.goto("/coordinators?mock=empty")
  await expect(page.getByRole("link", { name: "Load your data" })).toBeVisible()
})

test("a coordinator is redirected away from Coordinators", async ({ page }) => {
  await signIn(page, COORDINATOR)

  await page.goto("/coordinators")
  await expect.poll(() => new URL(page.url()).pathname).toBe("/next-actions")
  await expect(page.getByRole("link", { name: "Coordinators" })).toHaveCount(0)
})

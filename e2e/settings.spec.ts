import { expect, test } from "@playwright/test"
import type { Page } from "@playwright/test"

// Runs against the standalone mock host (`npm run dev:mock`): no Rails, no Docker. B-ACCOUNT lands the real
// endpoints in W3-1; here the mock API serves the contract fixtures. Screenshots land in e2e/screenshots for
// the PR's visual check against handoff/design/screenshots/15-settings.png.
const OWNER = "erin@harbor.test"
const COORDINATOR = "dana@harbor.test"

// Chromium denies clipboard writes by default; the invite form's Copy invite link needs the grant.
test.use({ permissions: ["clipboard-read", "clipboard-write"] })

const isDesktop = (page: Page) => (page.viewportSize()?.width ?? 0) >= 860
const shot = (page: Page, name: string) => `e2e/screenshots/${name}-${isDesktop(page) ? "desktop" : "mobile"}.png`

const noHorizontalScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)

async function signIn(page: Page, email: string) {
  await page.goto("/signin")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill("x")
  await page.getByRole("button", { name: "Sign in" }).click()
  // Wait for the authenticated shell: navigating away before the session resolves would drop it.
  await expect(page.locator("[data-shell]")).toBeVisible()
}

test("owner: the definition and the time zone save immediately, and an invitation can be sent and copied", async ({ page }) => {
  await signIn(page, OWNER)
  await page.goto("/settings")

  // The three cards, and the definition radios come from the kit.
  await expect(page.getByRole("heading", { name: "Definition of qualified" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Time zone" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Team" })).toBeVisible()

  // The radio itself is visually hidden (`sr-only`): a user clicks the card.
  await page.getByText("Reached medical records", { exact: true }).click()
  await expect(page.getByTestId("toast")).toContainText("Saved. Every number now uses this definition.")
  await expect(page.getByRole("radio", { name: /Reached medical records/ })).toBeChecked()

  await page.getByRole("button", { name: "Central" }).click()
  await expect(page.getByTestId("toast")).toContainText("Saved. Times now use this time zone.")
  await expect(page.getByRole("button", { name: "Central" })).toHaveAttribute("aria-pressed", "true")

  await page.getByLabel("Email").fill("jess@harbor.test")
  await page.getByLabel("Coordinator").fill("Jess Kim")
  await page.getByRole("button", { name: "Invite" }).click()

  await expect(page.getByTestId("toast")).toContainText("Invitation sent")
  await expect(page.getByText("jess@harbor.test")).toBeVisible()
  await page.getByRole("button", { name: "Copy invite link" }).click()
  await expect(page.getByTestId("toast")).toContainText("Invite link copied")
  // The response's `accept_url` is what gets copied (the mock uses the contract example's host).
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^http:\/\/[^/]+\/invite\/[A-Za-z0-9]+$/)

  // Mobile acceptance: one column, no horizontal scroll; the full page shows all three cards.
  expect(await noHorizontalScroll(page)).toBe(true)
  await page.screenshot({ path: shot(page, "settings"), fullPage: true })
})

test("invitee: the accept link works in a fresh context and lands on /next-actions", async ({ page, browser, baseURL }) => {
  // A fresh context is a signed-out visitor: the token in the URL is the only credential.
  const context = await browser.newContext({ viewport: page.viewportSize() ?? undefined, baseURL })
  const invitee = await context.newPage()
  await invitee.goto("/invite/mock-token")

  await expect(invitee.getByText(/Harbor Surrogacy/)).toBeVisible()
  await expect(invitee.getByLabel("Email")).toHaveValue("maya@harbor.test")
  expect(await noHorizontalScroll(invitee)).toBe(true)
  await invitee.screenshot({ path: shot(page, "invite") })

  await invitee.getByLabel("Your name").fill("Maya Chen")
  await invitee.getByLabel("Password").fill("long-enough-pass")
  await invitee.getByRole("button", { name: "Create account" }).click()

  await expect(invitee).toHaveURL(/\/next-actions$/)
  await expect(invitee.locator("[data-shell]")).toBeVisible()
  await context.close()
})

test("an expired invitation shows the friendly message", async ({ page }) => {
  await page.goto("/invite/expired")
  await expect(page.getByText("This invitation has expired. Ask your agency owner for a new one.")).toBeVisible()
  await expect(page.getByRole("button", { name: "Create account" })).toHaveCount(0)
})

test("a coordinator visiting /settings is sent to their own home", async ({ page }) => {
  await signIn(page, COORDINATOR)

  await page.goto("/settings")
  await expect.poll(() => new URL(page.url()).pathname).toBe("/next-actions")
  await expect(page.getByRole("link", { name: "Settings" })).toHaveCount(0)
})

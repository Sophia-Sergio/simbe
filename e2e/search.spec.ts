import { expect, test } from "@playwright/test"
import type { Page } from "@playwright/test"

// ⌘K candidate search palette (lane F-SEARCH), mock mode: `npm run dev:mock` serves the app + MSW,
// no Rails and no Docker. Screenshots land in e2e/screenshots for the PR's visual check against the
// brand tokens in docs/design/brand.md.
const OWNER = "erin@harbor.test"
const L4 = "aaaaaaaa-0000-4000-8000-000000000004" // Dana Ortiz's lead, "L4 Alpha" / Instagram / Nudge

const isDesktop = (page: Page) => (page.viewportSize()?.width ?? 0) >= 860
const shotFor = (page: Page) => `e2e/screenshots/search-${isDesktop(page) ? "desktop" : "mobile"}.png`

async function signIn(page: Page, email: string) {
  await page.goto("/signin")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill("x")
  await page.getByRole("button", { name: "Sign in" }).click()
  // Wait for the authenticated shell: navigating away before the session resolves would drop it.
  await expect(page.locator("[data-shell]")).toBeVisible()
}

/** Opens the palette the way each shell does: ⌘K on desktop, the top-bar search icon on mobile. */
async function openPalette(page: Page) {
  if (isDesktop(page)) await page.keyboard.press("Control+k")
  else await page.getByRole("button", { name: /Search candidates/ }).click()
  const palette = page.getByRole("dialog", { name: "Search candidates" })
  await expect(palette).toBeVisible()
  return palette
}

test("owner opens the palette, finds a lead and opens it with Enter", async ({ page }) => {
  await signIn(page, OWNER)
  const palette = await openPalette(page)

  const input = palette.getByRole("combobox", { name: "Search candidates" })
  await expect(input).toBeFocused()
  await input.fill("l4")

  const option = palette.getByRole("option", { name: /L4 Alpha/ })
  await expect(option).toBeVisible()
  // Name, channel pill and status pill all travel with the row.
  await expect(option).toContainText("Instagram")
  await expect(option).toContainText("Nudge")

  await page.screenshot({ path: shotFor(page) })

  await page.keyboard.press("Enter")
  await expect(page).toHaveURL(new RegExp(`lead=${L4}`))
  await expect(palette).toBeHidden()
})

test("treats % as a literal and closes on Escape", async ({ page }) => {
  await signIn(page, OWNER)
  const palette = await openPalette(page)
  const input = palette.getByRole("combobox", { name: "Search candidates" })

  await input.fill("l4")
  await expect(palette.getByRole("option", { name: /L4 Alpha/ })).toBeVisible()

  // Appending "%" makes a two-character literal query: if % were a wildcard, "l4%" would match;
  // as a literal it matches nothing, so the palette shows its empty state.
  await input.type("%")
  await expect(palette.getByText("No matches")).toBeVisible()

  await page.keyboard.press("Escape")
  await expect(palette).toBeHidden()
})

test("opening search closes an open lead panel first", async ({ page }) => {
  await signIn(page, OWNER)
  await page.goto(`/?lead=${L4}`)
  await expect(page.getByRole("heading", { name: "L4 Alpha" })).toBeVisible()

  await page.keyboard.press("Control+k")
  await expect(page.getByRole("dialog", { name: "Search candidates" })).toBeVisible()
  // Two overlays never stack: the lead panel is gone and its URL state is cleared.
  await expect(page.getByRole("heading", { name: "L4 Alpha" })).toBeHidden()
  await expect(page).not.toHaveURL(/lead=/)
})

import { expect, test } from "@playwright/test"
import type { Page } from "@playwright/test"

// Mobile shell, mock mode. No feature registers nav items yet, so the tab bar is empty until the feature
// lanes land (their own e2e covers the tabs); what is checkable now is the chrome: top bar, search, the
// account sheet, sign-out and "never wider than the screen".
test.skip(({ viewport }) => (viewport?.width ?? 0) >= 860, "mobile shell only")

async function signIn(page: Page, email: string) {
  await page.goto("/signin")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill("x")
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page.locator("[data-shell='mobile']")).toBeVisible()
}

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)

test("owner: top bar, search, account sheet and sign out", async ({ page }) => {
  await signIn(page, "erin@harbor.test")
  await expect(page.getByRole("button", { name: "Search candidates" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Account" })).toBeVisible()
  expect(await overflow(page)).toBeLessThanOrEqual(0)
  await page.screenshot({ path: "e2e/screenshots/shell-mobile-owner.png" })

  // ⌘K / Ctrl+K closes an open lead panel (the panel is modal, so the search icon behind it is inert and only the shortcut reaches the palette).
  await page.goto("/pipeline?range=90d&lead=abc")
  await expect(page.locator("[data-shell='mobile']")).toBeVisible()
  await expect(page.getByRole("dialog")).toBeVisible()
  await page.keyboard.press("Control+k")
  await expect(page).toHaveURL(/\/pipeline\?range=90d$/)
  // The search palette (F-SEARCH) opens on the same shortcut: close it before going on.
  const palette = page.getByRole("dialog", { name: /search/i })
  await expect(palette).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(palette).toBeHidden()

  await page.getByRole("button", { name: "Account" }).click()
  const sheet = page.getByRole("dialog", { name: "Account" })
  await expect(sheet).toContainText("erin@harbor.test")
  await page.screenshot({ path: "e2e/screenshots/shell-mobile-account.png" })
  await sheet.getByRole("button", { name: "Sign out" }).click()
  await expect(page).toHaveURL(/\/signin$/)
})

test("coordinator: signed in as the coordinator", async ({ page }) => {
  await signIn(page, "dana@harbor.test")
  await page.getByRole("button", { name: "Account" }).click()
  await expect(page.getByRole("dialog", { name: "Account" })).toContainText(/coordinator/i)
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toBeHidden()
  expect(await overflow(page)).toBeLessThanOrEqual(0)
  await page.screenshot({ path: "e2e/screenshots/shell-mobile-coordinator.png" })
})

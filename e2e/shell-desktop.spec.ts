import { expect, test } from "@playwright/test"
import type { Page } from "@playwright/test"

// Desktop shell, mock mode. No feature registers nav items yet, so the sidebar sections only show up once
// the feature lanes land; what is checkable now is the chrome: brand, agency, user, top bar, collapse,
// the ⌘K chord and sign-out. Screenshots land in e2e/screenshots for the visual check.
test.skip(({ viewport }) => (viewport?.width ?? 0) < 860, "desktop shell only")

async function signIn(page: Page, email: string) {
  await page.goto("/signin")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill("x")
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page.locator("[data-shell='desktop']")).toBeVisible()
}

test("owner: chrome, collapse, ⌘K and sign out", async ({ page }) => {
  await signIn(page, "erin@harbor.test")
  const sidebar = page.getByTestId("sidebar")
  await expect(sidebar).toContainText("Simbe")
  await expect(sidebar).toContainText("Harbor Surrogacy")
  await expect(sidebar).toContainText("Erin Walsh")
  await expect(sidebar).toContainText("Owner")
  await expect(page.getByRole("button", { name: /Search candidates/ })).toBeVisible()
  await expect(page.getByText(/^Snapshot /)).toBeVisible()
  expect((await sidebar.boundingBox())?.width).toBe(224)
  await page.screenshot({ path: "e2e/screenshots/shell-desktop-owner.png" })

  await page.getByRole("button", { name: "Collapse sidebar" }).click()
  await expect.poll(async () => (await sidebar.boundingBox())?.width).toBe(64)
  await page.screenshot({ path: "e2e/screenshots/shell-desktop-collapsed.png" })
  await page.reload()
  await expect.poll(async () => (await page.getByTestId("sidebar").boundingBox())?.width).toBe(64)
  await page.getByRole("button", { name: "Expand sidebar" }).click()
  await expect.poll(async () => (await sidebar.boundingBox())?.width).toBe(224)

  // ⌘K / Ctrl+K opens the palette, which closes an open lead panel (the only overlay-state signal until the search lane lands).
  await page.goto("/pipeline?range=90d&lead=abc")
  await expect(page.locator("[data-shell='desktop']")).toBeVisible()
  await page.keyboard.press("Control+k")
  await expect(page).toHaveURL(/\/pipeline\?range=90d$/)

  await page.getByRole("button", { name: "Sign out", exact: true }).first().click()
  await expect(page).toHaveURL(/\/signin$/)
})

test("coordinator: signed in as the coordinator", async ({ page }) => {
  await signIn(page, "dana@harbor.test")
  await expect(page.getByTestId("sidebar")).toContainText("Dana Ortiz")
  await expect(page.getByTestId("sidebar")).toContainText("Coordinator")
  await page.screenshot({ path: "e2e/screenshots/shell-desktop-coordinator.png" })
})

import { expect, test } from "@playwright/test"
import type { Page } from "@playwright/test"

async function signIn(page: Page, email: string) {
  await page.goto("/signin")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill("x")
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page.locator("[data-shell]")).toBeVisible()
}
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)

test("owner sees the connection, generates a key once, and it is masked after a reload", async ({ page }, testInfo) => {
  await signIn(page, "erin@harbor.test")
  await page.goto("/connect")
  await expect(page.getByLabel("Server URL", { exact: true })).toHaveValue("https://mcp.simbe.app/harbor")
  await expect(page.getByLabel("API key", { exact: true })).toHaveValue(/^simbe_live_ab12•+/)
  for (const tool of ["get_funnel", "get_channel_performance", "get_dropoff_reasons", "get_next_actions"]) {
    await expect(page.getByText(tool)).toBeVisible()
  }
  expect(await overflow(page)).toBeLessThanOrEqual(0)
  await page.screenshot({ path: `e2e/screenshots/connect-${testInfo.project.name.replace("mock-", "")}.png`, fullPage: true })

  await page.getByRole("button", { name: "Generate new key" }).click()
  await page.getByRole("group").getByRole("button", { name: "Generate new key" }).click()
  await expect(page.getByLabel("API key", { exact: true })).toHaveValue(/^simbe_live_[A-Za-z0-9]{24}$/)
  await expect(page.getByText(/shown only once/i)).toBeVisible()
  const full = await page.getByLabel("API key", { exact: true }).inputValue()
  await expect(page.locator("pre")).toContainText(full)
  expect(await overflow(page)).toBeLessThanOrEqual(0)

  await page.reload()
  await expect(page.getByLabel("API key", { exact: true })).toHaveValue(/•/)
  await expect(page.getByLabel("API key", { exact: true })).not.toHaveValue(full)
})

test("a coordinator is sent to their own home", async ({ page }) => {
  await signIn(page, "dana@harbor.test")
  await page.goto("/connect")
  await expect(page).toHaveURL(/\/next-actions$/)
})

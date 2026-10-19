import { expect, test } from "@playwright/test"
import type { Page } from "@playwright/test"

async function signInAsOwner(page: Page, query = "") {
  await page.goto(`/signin${query}`)
  await page.getByLabel("Email").fill("erin@harbor.test")
  await page.getByLabel("Password").fill("x")
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page.locator("[data-shell]")).toBeVisible()
}

test("owner sees this week's numbers, switches range and opens the funnel", async ({ page }, testInfo) => {
  await signInAsOwner(page)
  await page.goto("/")
  await expect(page.getByRole("heading", { level: 1, name: /Good (morning|afternoon|evening), Erin/ })).toBeVisible()
  await expect(page.getByText("10", { exact: true }).first()).toBeVisible()
  await expect(page.getByText("30.0%")).toBeVisible()
  await expect(page.getByRole("img", { name: /50% stall/ })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
  await page.screenshot({ path: `e2e/screenshots/week-${testInfo.project.name.replace("mock-", "")}.png`, fullPage: true })

  await page.getByRole("button", { name: "90 days" }).click()
  await expect(page).toHaveURL(/range=90d/)

  await page.getByRole("button", { name: "Open funnel" }).click()
  await expect(page).toHaveURL(/\/funnel\?range=90d$/)
})

test("an empty agency is offered 'Load your data'", async ({ page }) => {
  await signInAsOwner(page)
  await page.goto("/?mock=empty")
  await expect(page.getByRole("link", { name: /load your data/i })).toHaveAttribute("href", "/data")
})

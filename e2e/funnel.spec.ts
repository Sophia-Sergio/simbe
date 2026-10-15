import { expect, test } from "@playwright/test"
import type { Page } from "@playwright/test"

async function signIn(page: Page, email: string) {
  await page.goto("/signin")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill("x")
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page.locator("[data-shell]")).toBeVisible()
}

test("owner sees the funnel with the qualified row, exit line and form drop-off", async ({ page }, testInfo) => {
  await signIn(page, "erin@harbor.test")
  await page.goto("/funnel")
  for (const name of ["Inquiry", "Application", "Consult booked", "Attended consult", "Records", "Accepted"]) {
    await expect(page.getByText(name, { exact: true }).first()).toBeVisible()
  }
  await expect(page.getByText("10 leads")).toBeVisible()
  await expect(page.getByText("50% leave here · age, bmi")).toBeVisible()
  await expect(page.getByText("Pregnancy history")).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
  await page.screenshot({ path: `e2e/screenshots/funnel-${testInfo.project.name.replace("mock-", "")}.png`, fullPage: true })
})

test("a coordinator is sent to their own home", async ({ page }) => {
  await signIn(page, "dana@harbor.test")
  await page.goto("/funnel")
  await expect(page).toHaveURL(/\/next-actions$/)
})

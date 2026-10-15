import { expect, test } from "@playwright/test"

test("the app boots", async ({ page }, testInfo) => {
  await page.goto("/")
  await expect(page.getByRole("heading", { name: "Simbe" })).toBeVisible()
  await page.screenshot({ path: `e2e/screenshots/smoke-${testInfo.project.name}.png`, fullPage: true })
})

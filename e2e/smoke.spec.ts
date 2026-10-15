import { expect, test } from "@playwright/test"

test("the app boots and says it has no features yet", async ({ page }, testInfo) => {
  await page.goto("/")
  await expect(page.getByRole("heading", { name: "Simbe" })).toBeVisible()
  await expect(page.getByText("No features registered")).toBeVisible()
  await page.screenshot({ path: `e2e/screenshots/smoke-${testInfo.project.name}.png`, fullPage: true })
})

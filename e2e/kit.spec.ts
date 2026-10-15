import { expect, test } from "@playwright/test"

test("kit gallery renders its sections, overlays and toast without horizontal scroll", async ({ page }, testInfo) => {
  await page.goto("/__kit")

  await expect(page.getByRole("heading", { level: 1, name: "Kit" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Primitives" })).toBeVisible()

  await page.getByRole("button", { name: "Open modal", exact: true }).click()
  await expect(page.getByRole("dialog")).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toBeHidden()

  await page.getByRole("button", { name: "Open sheet", exact: true }).click()
  await expect(page.getByRole("dialog")).toBeVisible()
  await page.getByRole("button", { name: "Close", exact: true }).click()
  await expect(page.getByRole("dialog")).toBeHidden()

  await page.getByRole("button", { name: "Show toast", exact: true }).click()
  await expect(page.getByTestId("toast")).toBeVisible()

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)

  const suffix = testInfo.project.name.replace("mock-", "")
  await page.screenshot({ path: `e2e/screenshots/kit-${suffix}.png`, fullPage: true })
})

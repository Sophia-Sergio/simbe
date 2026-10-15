import { expect, test } from "@playwright/test"

// The /__kit gallery is a public dev/e2e route registered by features/_kit; it only renders once the
// app shell (W0-5) mounts the router.
test("the kit gallery renders, overlays open and close, and nothing overflows", async ({ page }, testInfo) => {
  await page.goto("/__kit")
  await expect(page.getByRole("heading", { level: 1, name: "Kit" })).toBeVisible()
  await expect(page.getByRole("heading", { level: 2, name: "Primitives" })).toBeVisible()

  await page.getByRole("button", { name: "Open modal" }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(dialog).toBeHidden()

  await page.getByRole("button", { name: "Open sheet" }).click()
  await expect(page.getByRole("heading", { name: "Lead panel" })).toBeVisible()
  await page.getByRole("button", { name: "Close", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Lead panel" })).toBeHidden()

  await page.getByRole("button", { name: "Show toast" }).click()
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible()

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)

  await page.screenshot({ path: `e2e/screenshots/kit-${testInfo.project.name}.png`, fullPage: true })
})

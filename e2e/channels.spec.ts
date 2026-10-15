import { expect, test } from "@playwright/test"
import type { Page } from "@playwright/test"

async function signIn(page: Page, email: string) {
  await page.goto("/signin")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill("x")
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page.locator("[data-shell]")).toBeVisible()
}
const shot = (name: string, projectName: string) => `e2e/screenshots/${name}-${projectName.replace("mock-", "")}.png`
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)

test("owner browses channels and a channel's detail", async ({ page }, testInfo) => {
  await signIn(page, "erin@harbor.test")
  await page.goto("/channels")
  await expect(page.getByText("Facebook").first()).toBeVisible()
  await expect(page.getByText("$150").first()).toBeVisible()
  await expect(page.getByText("66.7%").first()).toBeVisible()
  await expect(page.getByText("10% of leads have no source")).toBeVisible()
  expect(await overflow(page)).toBeLessThanOrEqual(0)
  await page.screenshot({ path: shot("channels", testInfo.project.name), fullPage: true })

  await page.getByText("Facebook").first().click()
  await expect(page).toHaveURL(/\/channels\/Facebook/)
  await expect(page.getByText("c-a")).toBeVisible()
  expect(await overflow(page)).toBeLessThanOrEqual(0)
  await page.screenshot({ path: shot("channel", testInfo.project.name), fullPage: true })
})

test("an unknown channel shows the not-found state", async ({ page }) => {
  await signIn(page, "erin@harbor.test")
  await page.goto("/channels/Nope")
  await expect(page.getByText("We couldn't find that channel")).toBeVisible()
})

test("a coordinator is sent to their own home", async ({ page }) => {
  await signIn(page, "dana@harbor.test")
  await page.goto("/channels")
  await expect(page).toHaveURL(/\/next-actions$/)
})

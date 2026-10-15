import { expect, test } from "@playwright/test"
import type { Page } from "@playwright/test"

// Runs against the standalone mock host. /pipeline has no screen yet, so NotFound inside the stub
// shell is the proof the router + guards work; the assertions are on data-shell and the URL.
async function signIn(page: Page, email: string) {
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill("x")
  await page.getByRole("button", { name: "Sign in" }).click()
}

test("sign-in round trip with guards, shell switch and sign-out", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })

  // Signed out: a cold load of a protected path lands on sign-in with ?next.
  await page.goto("/pipeline")
  await expect(page).toHaveURL(/\/signin\?next=%2Fpipeline$/)

  // Signing in returns to the page we wanted, inside the desktop shell.
  await signIn(page, "erin@harbor.test")
  await expect(page).toHaveURL(/\/pipeline$/)
  await expect(page.locator("[data-shell]")).toHaveAttribute("data-shell", "desktop")

  // Resizing swaps the shell without losing the route.
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator("[data-shell]")).toHaveAttribute("data-shell", "mobile")
  await expect(page).toHaveURL(/\/pipeline$/)

  // Sign out goes to a bare /signin; the coordinator lands on their own home, not on the old ?next.
  await page.getByRole("button", { name: "Sign out" }).click()
  await expect(page).toHaveURL(/\/signin$/)
  await signIn(page, "dana@harbor.test")
  await expect(page).toHaveURL(/\/next-actions$/)
  await expect(page.locator("[data-shell]")).toBeVisible()
})

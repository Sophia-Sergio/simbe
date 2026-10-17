import { expect, test } from "@playwright/test"
import type { Page } from "@playwright/test"

// Runs against the standalone mock host (`npm run dev:mock`): no Rails, no Docker. The backend lane
// (B-LEADS) and the real board land in W3-1; here the mock API serves the contract fixtures.

async function signIn(page: Page, email: string) {
  await page.goto("/signin")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill("x")
  await page.getByRole("button", { name: "Sign in" }).click()
  // Wait for the shell before navigating again: a `goto` that beats the sign-in POST would reload signed out.
  await expect(page.locator("[data-shell]")).toBeVisible()
}

const screenshotName = (projectName: string) => (projectName.includes("mobile") ? "pipeline-mobile" : "pipeline-desktop")

test.describe("desktop board", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 860, "desktop board only")

  test("owner: four wells with counts, a card opens the panel, list filters", async ({ page }, testInfo) => {
    await signIn(page, "erin@harbor.test")
    await page.goto("/pipeline")

    for (const [name, count] of [
      ["Action needed", "4"],
      ["In application", "0"],
      ["Consult", "0"],
      ["Qualified", "3"],
    ]) {
      await expect(page.getByRole("region", { name }).getByTestId("column-count")).toHaveText(count)
    }
    await expect(page.getByRole("region", { name: "In application" })).toContainText("Nothing here")
    await page.screenshot({ path: `e2e/screenshots/${screenshotName(testInfo.project.name)}.png` })

    // The lead panel is F-LEADPANEL's overlay; this lane's contract is that the card sets ?lead=<id>.
    await page.getByRole("button", { name: /L7 Alpha/ }).click()
    await expect(page).toHaveURL(/lead=aaaaaaaa-0000-4000-8000-000000000007/)

    await page.goto("/pipeline?view=list")
    await page.getByLabel("Filter leads").fill("l4")
    await expect(page.getByText("L4 Alpha")).toBeVisible()
    await expect(page.getByText("L7 Alpha")).toHaveCount(0)
  })

  test("coordinator: no coordinator dropdown and only her cards", async ({ page }) => {
    await signIn(page, "dana@harbor.test")
    await page.goto("/pipeline")

    await expect(page.getByRole("button", { name: "List" })).toBeVisible()
    await expect(page.getByRole("combobox", { name: "All coordinators" })).toHaveCount(0)
    const action = page.getByRole("region", { name: "Action needed" })
    await expect(action.getByTestId("column-count")).toHaveText("3")
    await expect(action.getByText("L4 Alpha")).toBeVisible()
    // L2 belongs to Jess Kim: the API scopes a coordinator to her own leads.
    await expect(page.getByText("L2 Alpha")).toHaveCount(0)
  })

  test("owner: pending load and empty data states", async ({ page }) => {
    await signIn(page, "erin@harbor.test")
    await page.goto("/pipeline?mock=loading")
    await expect(page.getByText("Loading your data…")).toBeVisible()

    await page.goto("/pipeline?mock=empty")
    await expect(page.getByRole("link", { name: "Load your data" })).toBeVisible()
  })
})

test.describe("mobile board", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) >= 860, "mobile board only")

  test("owner: column chips switch one column at a time, no horizontal scroll", async ({ page }, testInfo) => {
    await signIn(page, "erin@harbor.test")
    await page.goto("/pipeline")

    const chips = page.getByRole("group", { name: "Pipeline columns" })
    await expect(chips).toBeVisible()
    await expect(page.getByRole("region")).toHaveCount(1)
    await expect(page.getByRole("region", { name: "Action needed" })).toBeVisible()
    await page.screenshot({ path: `e2e/screenshots/${screenshotName(testInfo.project.name)}.png` })

    await chips.getByRole("button", { name: /Qualified/ }).click()
    await expect(page.getByRole("region", { name: "Qualified" })).toBeVisible()
    await expect(page.getByRole("region", { name: "Action needed" })).toHaveCount(0)

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  })

  // jsdom has no layout, so the "a long name cannot overflow" guarantee is measured in a real browser:
  // inject a long name and assert the row (and the document) still fit their width.
  test("owner: a very long lead name does not overflow a list row", async ({ page }) => {
    await signIn(page, "erin@harbor.test")
    await page.goto("/pipeline?view=list")

    // Class-based so the locator survives the text change below (a name-based one would stop matching).
    const row = page.locator("button.rounded-row").first()
    await expect(row).toBeVisible()
    await row.locator("span.truncate").first().evaluate((element) => {
      element.textContent = `Anastasia ${"Verylongword".repeat(12)}`
    })

    expect(await row.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  })
})

import { expect, test } from "@playwright/test"
import type { Page } from "@playwright/test"
import { signIn } from "../support/auth"
import { navTo } from "../support/nav"
import { seed } from "../support/seed"
import { expectNoHorizontalScroll, isDesktop, shot } from "../support/viewport"

// Journey 2 — the owner's weekly review (Simbe Flows: "Owner weekly review"): This week → Funnel →
// Channels → channel detail → Pipeline → a lead's Screener tab → Coordinators → a coordinator →
// Settings (change the qualified definition) → This week recomputes. Real stack only.
//
// The qualified definition is agency-wide, and this journey changes it. The journeys share the one
// seeded `harbor` agency, so the suite runs serially (`--workers=1`, see the plan's Done-when note)
// and `e2e:seed` restores the documented config in `beforeAll`, so no journey depends on another.

const COLUMNS: [name: string, count: string][] = [
  ["Action needed", "4"],
  ["In application", "0"],
  ["Consult", "0"],
  ["Qualified", "3"],
]

const qualifiedValue = (page: Page, value: string) =>
  page.getByText("Qualified", { exact: true }).locator("..").getByText(value, { exact: true })

test.describe("journey 2 — owner weekly review", () => {
  test.skip(process.env.E2E_API !== "real", "journeys run against the real stack (E2E_API=real)")

  test("reviews the week and drills into funnel, channels, pipeline, coordinators and settings", async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    seed()
    await signIn(page, "owner")

    // This week: the KPIs and the recommended actions (Alpha: 10 leads, 3 qualified = 30.0%).
    await expect(page.getByRole("heading", { level: 1, name: /Good (morning|afternoon|evening), Erin/ })).toBeVisible()
    await expect(qualifiedValue(page, "3")).toBeVisible()
    await expect(page.getByText("Recommended actions")).toBeVisible()
    await expectNoHorizontalScroll(page)
    await page.screenshot({ path: shot("weekly-01-this-week", testInfo), fullPage: true })

    // "Open funnel" carries the range through; the qualified row is highlighted.
    await page.getByRole("button", { name: "Open funnel" }).click()
    await expect(page).toHaveURL(/\/funnel\?range=/)
    await expect(page.getByText("Attended consult", { exact: true }).first()).toHaveClass(/text-brand-text/)
    await page.screenshot({ path: shot("weekly-02-funnel", testInfo), fullPage: true })

    // Channels, then a channel's detail and back.
    await navTo(page, "Channels")
    await expect(page.getByText("Facebook").first()).toBeVisible()
    await page.getByText("Facebook").first().click()
    await expect(page).toHaveURL(/\/channels\/Facebook/)
    await expect(page.getByText("c-a")).toBeVisible()
    await page.screenshot({ path: shot("weekly-03-channel-detail", testInfo), fullPage: true })
    await page.getByRole("main").getByRole("link", { name: "Channels" }).click()
    await expect(page).toHaveURL(/\/channels(\?|$)/)

    // Pipeline: the board column counts, then a lead's panel on the Screener tab (verdicts only).
    await navTo(page, "Pipeline")
    if (isDesktop(page)) {
      for (const [name, count] of COLUMNS) {
        await expect(page.getByRole("region", { name }).getByTestId("column-count")).toHaveText(count)
      }
    } else {
      const chips = page.getByRole("group", { name: "Pipeline columns" })
      for (const [name, count] of COLUMNS) {
        await expect(chips.getByRole("button", { name: `${name}, ${count}` })).toBeVisible()
      }
    }
    await page.screenshot({ path: shot("weekly-04-pipeline", testInfo) })

    await page.getByRole("button", { name: /L4 Alpha/ }).click()
    await expect(page).toHaveURL(/lead=/)
    const panel = page.getByRole("dialog")
    await panel.getByRole("tab", { name: "Screener" }).click()
    await expect(panel.getByTestId("screener-item")).toHaveCount(10)
    await expect(panel.getByText("Health answers are visible to the assigned coordinator only.")).toBeVisible()
    // The owner gets verdicts only — never a raw answer.
    await expect(panel.getByTestId("raw-answer")).toHaveCount(0)
    await page.screenshot({ path: shot("weekly-05-lead-screener", testInfo) })
    await page.keyboard.press("Escape")
    await expect(panel).toBeHidden()

    // Coordinators → a coordinator's detail.
    await navTo(page, "Coordinators")
    await page.getByRole("link", { name: /Dana Ortiz/ }).click()
    await expect(page.getByRole("heading", { name: "Dana Ortiz" })).toBeVisible()
    await expect(page.getByText("Qualified rate")).toBeVisible()
    await page.screenshot({ path: shot("weekly-06-coordinator", testInfo), fullPage: true })

    // Settings: change the definition — it saves immediately and recomputes every number.
    await navTo(page, "Settings")
    await page.getByText("Reached medical records", { exact: true }).click()
    await expect(page.getByTestId("toast")).toContainText("Saved. Every number now uses this definition.")
    await page.screenshot({ path: shot("weekly-07-settings", testInfo), fullPage: true })

    // This week now counts Alpha's 2 `records` leads as qualified.
    await navTo(page, "This week")
    await expect(qualifiedValue(page, "2")).toBeVisible()
    await expectNoHorizontalScroll(page)
    await page.screenshot({ path: shot("weekly-08-recomputed", testInfo), fullPage: true })
  })
})

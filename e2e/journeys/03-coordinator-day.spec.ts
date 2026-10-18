import { expect, test } from "@playwright/test"
import type { Page } from "@playwright/test"
import { signIn } from "../support/auth"
import { navTo } from "../support/nav"
import { seed } from "../support/seed"
import { expectNoHorizontalScroll, isDesktop, shot } from "../support/viewport"

// Journey 3 — a coordinator's day (Simbe Flows: "Coordinator daily work"): Next actions → open L4 →
// the sms: link → Mark done (counts and progress move) → My leads (only Dana's) → raw screener
// answers on her own lead, and another coordinator's lead is not available. Real stack only.
//
// The journeys share the seeded `harbor` agency, so the suite runs serially (see the plan's
// Done-when note).

const L4 = "aaaaaaaa-0000-4000-8000-000000000004" // Dana Ortiz's lead
const L7 = "aaaaaaaa-0000-4000-8000-000000000007" // Priya Shah's lead

const actionNeededCount = async (page: Page) => {
  if (isDesktop(page)) return page.getByRole("region", { name: "Action needed" }).getByTestId("column-count")
  return page.getByRole("group", { name: "Pipeline columns" }).getByRole("button", { name: "Action needed, 3" })
}

test.describe("journey 3 — coordinator daily work", () => {
  test.skip(process.env.E2E_API !== "real", "journeys run against the real stack (E2E_API=real)")

  test("works her next actions, completes a lead and sees only her own screener answers", async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    seed()
    await signIn(page, "coordinator")
    await expect(page).toHaveURL(/\/next-actions$/)

    // Next actions: Dana's three open items and the day's progress.
    await expect(page.getByRole("heading", { name: "Next actions" })).toBeVisible()
    await expect(page.getByText("3 open", { exact: true })).toBeVisible()
    await expect(page.getByText("0 / 3", { exact: true })).toBeVisible()
    await expect(page.getByText(/most urgent first/)).toBeVisible()
    const nudge = page.getByRole("region", { name: "Nudge applications" })
    await expect(nudge.getByText("L4 Alpha")).toBeVisible()
    await expectNoHorizontalScroll(page)
    await page.screenshot({ path: shot("coordinator-01-next-actions", testInfo), fullPage: true })

    // Open L4: the contact actions are real links and Mark done is hers to press.
    await nudge.getByText("L4 Alpha").click()
    await expect(page).toHaveURL(new RegExp(`lead=${L4}`))
    const panel = page.getByRole("dialog")
    await expect(panel.getByRole("heading", { name: "L4 Alpha" })).toBeVisible()
    await expect(panel.getByRole("link", { name: "Send text" })).toHaveAttribute("href", "sms:555-0183-0004")
    await expect(panel.getByRole("link", { name: "Call" })).toHaveAttribute("href", "tel:555-0183-0004")
    await page.screenshot({ path: shot("coordinator-02-lead", testInfo) })

    const done = panel.getByTestId("mark-done")
    await expect(done).toHaveText("Mark done")
    await done.click()
    await expect(done).toHaveText("Done")
    await expect(done).toHaveAttribute("data-done", "true")
    await page.screenshot({ path: shot("coordinator-03-done", testInfo) })

    // Closing the panel, the board reflects the completion.
    await page.keyboard.press("Escape")
    await expect(panel).toBeHidden()
    await expect(page.getByText("2 open", { exact: true })).toBeVisible()
    await expect(page.getByText("1 / 3", { exact: true })).toBeVisible()
    await page.screenshot({ path: shot("coordinator-04-progress", testInfo), fullPage: true })

    // My leads: only her cards (L2 belongs to Jess Kim).
    await navTo(page, "My leads")
    await expect(page).toHaveURL(/\/pipeline/)
    await expect(await actionNeededCount(page)).toBeVisible()
    await expect(page.getByText("L4 Alpha")).toBeVisible()
    await expect(page.getByText("L2 Alpha")).toHaveCount(0)
    await expectNoHorizontalScroll(page)
    await page.screenshot({ path: shot("coordinator-05-my-leads", testInfo), fullPage: true })

    // Her own lead: raw health answers are visible to the assigned coordinator.
    await page.getByRole("button", { name: /L4 Alpha/ }).click()
    await expect(page).toHaveURL(new RegExp(`lead=${L4}`))
    const ownPanel = page.getByRole("dialog")
    await ownPanel.getByRole("tab", { name: "Screener" }).click()
    await expect(ownPanel.getByTestId("screener-item")).toHaveCount(10)
    await expect(ownPanel.getByTestId("raw-answer")).toHaveCount(10)
    await page.screenshot({ path: shot("coordinator-06-raw-answers", testInfo) })
    await page.keyboard.press("Escape")

    // Another coordinator's lead: "This lead isn't available", never the answers.
    await page.goto(`/pipeline?lead=${L7}`)
    const foreign = page.getByRole("dialog")
    await expect(foreign.getByText("This lead isn't available")).toBeVisible()
    await expect(foreign.getByText("L7 Alpha")).toHaveCount(0)
    await expect(foreign.getByTestId("raw-answer")).toHaveCount(0)
    await page.screenshot({ path: shot("coordinator-07-not-available", testInfo) })
  })
})

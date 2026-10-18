import { expect, test } from "@playwright/test"
import { alphaFiles, reset } from "../support/seed"
import { expectNoHorizontalScroll, shot, viewportName } from "../support/viewport"

// Journey 1 — a new agency onboards from zero (handoff/design/prototype/Simbe Flows.dc.html, flow
// "Sign up"): account → agency (Pacific, "Attended a consult") → ad accounts → upload the seven
// Alpha CSVs (review `Leads 0 → 10 (+10)`) → load → invite Jess Kim → the dashboard shows 10 leads
// and 3 qualified. Real stack only; the layout is compared against
// handoff/design/screenshots/02-signup-agency.png and 03-signup-load-data.png.

test.describe("journey 1 — new agency onboarding", () => {
  test.skip(process.env.E2E_API !== "real", "journeys run against the real stack (E2E_API=real)")

  test("signs up, connects Meta, loads the Alpha export and opens the dashboard", async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    const viewport = viewportName(testInfo)
    // Project-scoped so the two Playwright projects never delete each other's in-flight agency.
    const agency = `E2E Onboarding ${viewport}`
    // A previous run's agency of the same name would collide on the unique slug; drop it, then reseed.
    reset(agency)
    await page.goto("/signup")

    // Step 1 — account (email is unique per run so a re-run is never "email taken").
    await page.getByLabel("Your name").fill("Erin Walsh")
    await page.getByLabel("Work email").fill(`e2e+${viewport}+${Date.now()}@example.test`)
    await page.getByLabel("Password").fill("long-enough-pass")
    await page.getByRole("button", { name: "Continue" }).click()

    // Step 2 — agency: Pacific + "Attended a consult" (the documented Harbor definition).
    await expect(page.getByRole("heading", { name: "Set up your agency" })).toBeVisible()
    await page.getByLabel("Agency name").fill(agency)
    await page.getByRole("button", { name: "Pacific" }).click()
    await expect(page.getByRole("button", { name: "Pacific" })).toHaveAttribute("aria-pressed", "true")
    await page.getByText("Attended a consult", { exact: false }).first().click()
    await page.screenshot({ path: shot("onboarding-01-agency", testInfo), fullPage: true })
    await page.getByRole("button", { name: "Continue" }).click()

    // Step 3 — optional Meta connection.
    await expect(page.getByRole("heading", { name: "Connect your ad accounts" })).toBeVisible()
    await page.getByRole("button", { name: "Connect" }).first().click()
    await expect(page.getByRole("button", { name: "Connected" })).toBeVisible()
    await page.screenshot({ path: shot("onboarding-02-meta", testInfo) })
    await page.getByRole("button", { name: "Continue" }).click()

    // Step 4 — upload the seven Alpha CSVs.
    await expect(page.getByRole("heading", { name: "Load your data" })).toBeVisible()
    await page.getByLabel("CSV files").setInputFiles(alphaFiles())
    await expect(page.getByText("Review changes")).toBeVisible({ timeout: 60_000 })
    await expect(page.getByText("Leads 0 → 10 (+10)")).toBeVisible()
    await expect(page.getByText(`Files matched to ${agency} 7 of 7`)).toBeVisible()
    await expect(page.getByText("Screener answers Encrypted")).toBeVisible()
    await expectNoHorizontalScroll(page)
    await page.screenshot({ path: shot("onboarding-03-review", testInfo), fullPage: true })

    await page.getByRole("button", { name: "Load data" }).click()
    await expect(page.getByText("Your data is loaded")).toBeVisible({ timeout: 90_000 })
    await page.screenshot({ path: shot("onboarding-04-loaded", testInfo) })
    await page.getByRole("button", { name: "Continue" }).click()

    // Step 5 — invite a coordinator by a name that exists in the export.
    await expect(page.getByRole("heading", { name: "Invite your team" })).toBeVisible()
    await page.getByLabel("Email").fill(`jess+${viewport}@example.test`)
    await page.getByLabel("Coordinator").selectOption("Jess Kim")
    await page.getByRole("button", { name: "Invite" }).click()
    await expect(page.getByTestId("toast")).toContainText("Invitation sent")
    await expect(page.getByText("Invited").first()).toBeVisible()
    await page.screenshot({ path: shot("onboarding-05-team", testInfo), fullPage: true })

    await page.getByRole("link", { name: "Open my dashboard" }).click()
    await expect(page.locator("[data-shell]")).toBeVisible()

    // The dashboard, in the new agency's own numbers: 10 leads, 3 qualified (30.0%).
    await expect(page.getByRole("heading", { level: 1, name: /Good (morning|afternoon|evening), Erin/ })).toBeVisible()
    await expect(page.getByText("10", { exact: true }).first()).toBeVisible()
    await expect(page.getByText("Qualified", { exact: true }).locator("..").getByText("3", { exact: true })).toBeVisible()
    await expect(page.getByText("30.0%")).toBeVisible()
    await expectNoHorizontalScroll(page)
    await page.screenshot({ path: shot("onboarding-06-dashboard", testInfo), fullPage: true })
  })
})

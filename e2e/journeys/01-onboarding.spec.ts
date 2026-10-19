import { expect, test } from "@playwright/test"
import type { Page } from "@playwright/test"
import { alphaFiles, reset } from "../support/seed"
import { signIn } from "../support/auth"
import { expectNoHorizontalScroll, shot, viewportName } from "../support/viewport"

// Journey 1 — a new agency onboards from zero (handoff/design/prototype/Simbe Flows.dc.html, flow
// "Sign up"): account → agency (Pacific, "Attended a consult") → upload the seven
// Alpha CSVs (review `Leads 0 → 10 (+10)`) → load → invite Jess Kim → the dashboard shows 10 leads
// and 3 qualified. Real stack only; the layout is compared against
// handoff/design/screenshots/02-signup-agency.png and 03-signup-load-data.png.
//
// It ends with the cross-agency check the other journeys cannot make: the invitation the new agency
// just created is invisible to the seeded `harbor` owner, and deleting it by id is a 404
// (docs/conventions/multi-tenancy.md).

/** The KPI card whose label is `label`, so a value like "10" is never matched anywhere on the page. */
const kpi = (page: Page, label: string) => page.getByText(label, { exact: true }).locator("..")

test.describe("journey 1 — new agency onboarding", () => {
  test.skip(process.env.E2E_API !== "real", "journeys run against the real stack (E2E_API=real)")

  test("signs up, loads the Alpha export and opens the dashboard", async ({ page, browser }, testInfo) => {
    test.setTimeout(180_000)
    const viewport = viewportName(testInfo)
    // The agency name carries the viewport, so the two Playwright projects never reset each other's.
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

    // Step 3 — upload the seven Alpha CSVs.
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

    // Step 4 — invite a coordinator by a name that exists in the export.
    await expect(page.getByRole("heading", { name: "Invite your team" })).toBeVisible()
    await page.getByLabel("Email").fill(`jess+${viewport}@example.test`)
    await page.getByLabel("Coordinator").selectOption("Jess Kim")
    await page.getByRole("button", { name: "Invite" }).click()
    await expect(page.getByTestId("toast")).toContainText("Invitation sent")
    await expect(page.getByText("Invited").first()).toBeVisible()
    await page.screenshot({ path: shot("onboarding-05-team", testInfo), fullPage: true })

    await page.getByRole("link", { name: "Open my dashboard" }).click()
    await expect(page.locator("[data-shell]")).toBeVisible()

    // The dashboard, in the new agency's own numbers: 10 leads, 3 qualified (30.0%) — each value
    // read from its KPI card, never from any "10" on the page.
    await expect(page.getByRole("heading", { level: 1, name: /Good (morning|afternoon|evening), Erin/ })).toBeVisible()
    await expect(kpi(page, "Leads").getByText("10", { exact: true })).toBeVisible()
    await expect(kpi(page, "Qualified").getByText("3", { exact: true })).toBeVisible()
    await expect(kpi(page, "Qualified rate").getByText("30.0%", { exact: true })).toBeVisible()
    await expectNoHorizontalScroll(page)
    await page.screenshot({ path: shot("onboarding-06-dashboard", testInfo), fullPage: true })

    // Cross-agency isolation. A lead's id is its export `external_id`, which two agencies that
    // uploaded the same file share by design, so the probe is a per-agency row: the invitation this
    // agency just created. Another agency's owner can neither see it nor delete it by id.
    const team = await page.request.get("/api/v1/team")
    expect(team.status()).toBe(200)
    const { invitations } = (await team.json()) as { invitations: { id: string; email: string }[] }
    const invitation = invitations.find((row) => row.email.startsWith("jess+"))
    if (!invitation) throw new Error("the invite step did not create an invitation")

    const baseURL = String(testInfo.project.use.baseURL)
    const harborContext = await browser.newContext({ viewport: page.viewportSize() ?? undefined, baseURL })
    const harborPage = await harborContext.newPage()
    await signIn(harborPage, "owner") // erin@harbor.test
    const harborTeam = await harborPage.request.get("/api/v1/team")
    expect(harborTeam.status()).toBe(200)
    expect(JSON.stringify(await harborTeam.json())).not.toContain(invitation.email)
    // A mutation needs the CSRF header the app's client sends (api/base_controller.rb).
    const deleted = await harborPage.request.delete(`/api/v1/invitations/${invitation.id}`, {
      headers: { "X-Requested-With": "simbe" },
    })
    expect(deleted.status()).toBe(404)
    await harborContext.close()
  })
})

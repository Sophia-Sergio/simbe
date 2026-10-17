import { existsSync, readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { expect, test } from "@playwright/test"
import type { Page, TestInfo } from "@playwright/test"

// The seven CSVs an export consists of (matched by basename, in any order).
const EXPORT_FILES = [
  "leads.csv",
  "stage_history.csv",
  "contact_log.csv",
  "screener_answers.csv",
  "web_sessions.csv",
  "appointments.csv",
  "applications.csv",
]

const screenshot = (name: string, testInfo: TestInfo) =>
  `e2e/screenshots/${name}-${testInfo.project.name.replace(/^(mock|real)-/, "")}.png`

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)

const csvFiles = (names: readonly string[]) =>
  names.map((name) => ({ name, mimeType: "text/csv", buffer: Buffer.from("id,source\n1,fb\n") }))

async function fillAccount(page: Page, email = "erin@new.test") {
  const next = page.getByRole("button", { name: "Continue" })
  await expect(next).toBeDisabled()
  await page.getByLabel("Your name").fill("Erin Walsh")
  await page.getByLabel("Work email").fill(email)
  await page.getByLabel("Password").fill("long-enough-pass")
  await expect(next).toBeEnabled()
  await next.click()
  await expect(page.getByRole("heading", { name: "Set up your agency" })).toBeVisible()
}

/** Step 3 is optional: connect Meta, then continue. */
async function connectMetaAndContinue(page: Page) {
  await expect(page.getByRole("heading", { name: "Connect your ad accounts" })).toBeVisible()
  await page.getByRole("button", { name: "Connect" }).first().click()
  await expect(page.getByRole("button", { name: "Connected" })).toBeVisible()
  await page.getByRole("button", { name: "Continue" }).click()
}

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const exportsDir = process.env.SIMBE_EXPORTS_DIR ?? join(repo, "handoff/takehome/exports")
const harborDir = join(exportsDir, "harbor")
const realMode = process.env.E2E_API === "real"
const harborPresent = existsSync(join(harborDir, "leads.csv"))

function harborFiles() {
  return EXPORT_FILES.map((name) => ({ name, mimeType: "text/csv", buffer: readFileSync(join(harborDir, name)) }))
}

test("signs up, loads the seven exports and invites a coordinator", async ({ page }, testInfo) => {
  await page.goto("/signup?mock=new")

  await fillAccount(page)
  await page.getByLabel("Agency name").fill("Harbor demo")
  await page.getByRole("button", { name: "Pacific" }).click()
  await page.screenshot({ path: screenshot("signup-agency", testInfo), fullPage: true })
  await page.getByRole("button", { name: "Continue" }).click()

  await connectMetaAndContinue(page)

  await expect(page.getByRole("heading", { name: "Load your data" })).toBeVisible()
  await expect(page.getByText("Screener answers are encrypted")).toBeVisible()
  await expect(page.getByText("Waiting")).toHaveCount(7)
  await page.screenshot({ path: screenshot("signup-load-data", testInfo), fullPage: true })

  await page.getByLabel("CSV files").setInputFiles(csvFiles(EXPORT_FILES))
  await expect(page.getByText("Review changes")).toBeVisible()
  await expect(page.getByText("Files matched to Harbor demo 7 of 7")).toBeVisible()
  expect(await overflow(page)).toBeLessThanOrEqual(0)

  await page.getByRole("button", { name: "Load data" }).click()
  await expect(page.getByText("Your data is loaded")).toBeVisible()
  await page.getByRole("button", { name: "Continue" }).click()

  await expect(page.getByRole("heading", { name: "Invite your team" })).toBeVisible()
  await page.getByLabel("Email").fill("sam@harbor.test")
  await page.getByLabel("Coordinator").selectOption("Jess Kim")
  await page.getByRole("button", { name: "Invite" }).click()
  await expect(page.getByText("Invitation sent")).toBeVisible()
  await expect(page.getByText("Invited").first()).toBeVisible()

  await page.getByRole("link", { name: "Open my dashboard" }).click()
  await expect(page.locator("[data-shell]")).toBeVisible()
})

test("a taken email returns to step 1 with the error and no horizontal scroll", async ({ page }) => {
  await page.goto("/signup?mock=new")

  await fillAccount(page, "taken@x.test")
  await page.getByLabel("Agency name").fill("Harbor")
  await page.getByRole("button", { name: "Continue" }).click()

  await expect(page.getByText("That email already has an account")).toBeVisible()
  await expect(page.getByLabel("Your name")).toHaveValue("Erin Walsh")
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible()
  expect(await overflow(page)).toBeLessThanOrEqual(0)
})

// Real exports are local-only and never in CI: this journey needs E2E_API=real and a Rails stack
// (`make ports` for E2E_BASE_URL). Golden numbers: spec/real_data/golden.json.
test.describe("real exports", () => {
  test.skip(!realMode || !harborPresent, "needs E2E_API=real and handoff/takehome/exports/harbor")

  test("two agencies load the same Harbor export and keep independent numbers", async ({ browser }, testInfo) => {
    test.setTimeout(600_000)

    const signUpAndLoad = async (email: string, agency: string, definition: "attended a consult" | "reached medical records", timezone: string) => {
      const context = await browser.newContext()
      const page = await context.newPage()
      await page.goto("/signup")
      await fillAccount(page, email)
      await page.getByLabel("Agency name").fill(agency)
      await page.getByRole("button", { name: timezone }).click()
      await page.getByText(definition, { exact: false }).first().click()
      await page.getByRole("button", { name: "Continue" }).click()

      await expect(page.getByRole("heading", { name: "Connect your ad accounts" })).toBeVisible()
      await page.getByRole("button", { name: "Continue" }).click()

      await page.getByLabel("CSV files").setInputFiles(harborFiles())
      await expect(page.getByText("Review changes")).toBeVisible({ timeout: 120_000 })
      await expect(page.getByText(`Files matched to ${agency} 7 of 7`)).toBeVisible()
      await page.getByRole("button", { name: "Load data" }).click()
      await expect(page.getByText("Your data is loaded")).toBeVisible({ timeout: 150_000 })

      await page.getByRole("button", { name: "Continue" }).click()
      await expect(page.getByRole("heading", { name: "Invite your team" })).toBeVisible()
      await page.getByRole("link", { name: "Open my dashboard" }).click()
      await expect(page.locator("[data-shell]")).toBeVisible()
      return page
    }

    // Agency 1 — Harbor's documented config: attended a consult + Pacific.
    const first = await signUpAndLoad("erin+one@harbor.test", "Harbor demo", "attended a consult", "Pacific")
    await first.getByRole("button", { name: "12 months" }).click()
    await expect(first.getByText("3,530", { exact: true }).first()).toBeVisible()
    await expect(first.getByText("496", { exact: true }).first()).toBeVisible()
    await expect(first.getByText("14.1%", { exact: true }).first()).toBeVisible()
    await first.screenshot({ path: screenshot("signup-load-data", testInfo), fullPage: true })

    // Agency 2 — the same files under records + Central: qualified = golden qualified_all_time.records.
    const second = await signUpAndLoad("erin+two@harbor.test", "Harbor demo 2", "reached medical records", "Central")
    await second.getByRole("button", { name: "12 months" }).click()
    await expect(second.getByText("400", { exact: true }).first()).toBeVisible()

    // Agency 1 is unchanged by agency 2's load.
    await first.reload()
    await first.getByRole("button", { name: "12 months" }).click()
    await expect(first.getByText("3,530", { exact: true }).first()).toBeVisible()
    await expect(first.getByText("496", { exact: true }).first()).toBeVisible()
  })
})

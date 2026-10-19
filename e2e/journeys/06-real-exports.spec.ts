import { existsSync, readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { expect, test } from "@playwright/test"
import type { Page } from "@playwright/test"
import { EXPORT_FILES, reset } from "../support/seed"
import { expectNoHorizontalScroll, isDesktop, shot, viewportName } from "../support/viewport"

// Journey 6 — the real exports at sign-up (@real, local only). Owners load the seven CSVs by
// uploading them during sign-up; this proves that path end to end against the independent oracle
// `spec/real_data/golden.json` (docs/conventions/real-data.md). The exports are git-ignored and
// never in CI, and the Playwright host only sees them when SIMBE_EXPORTS_DIR is exported, so the
// whole file skips by construction unless a human asks for it:
//
//   SIMBE_EXPORTS_DIR=<main checkout>/handoff/takehome/exports E2E_API=real E2E_BASE_URL=… \
//     make e2e ARGS="journeys --grep @real --workers=1"
//
// Every number comes from the oracle; nothing here hard-codes a count. Loads are slow (Lakeside is
// ~625k rows), so each load waits up to 150 s.
//
// The journeys share the seeded `harbor` agency, so the suite runs serially (see the plan's
// Done-when note).

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")
const exportsDir = process.env.SIMBE_EXPORTS_DIR ?? join(repo, "handoff/takehome/exports")
const harborDir = join(exportsDir, "harbor")
const lakesideDir = join(exportsDir, "lakeside")
const exportsPresent = existsSync(join(harborDir, "leads.csv")) && existsSync(join(lakesideDir, "leads.csv"))

// The oracle is read (not imported): Playwright's ESM loader wants a JSON import attribute, and the
// committed file is the same one the backend `:real_data` specs compare against.
type ChannelRow = { leads: number; qualified: number; rate: number }
type CoordinatorRow = { leads: number; qualified: number; qualified_rate: number; overdue: number }
type AgencyGolden = {
  summary: Record<string, { leads: number; qualified: number; qualified_rate: number }>
  funnel_12m: { total: number; counts: Record<string, number> }
  channels_12m: Record<string, ChannelRow>
  insights_12m: { unattributed: { count: number }; out_of_area: { count: number } }
  queues_all_leads: Record<string, number>
  board_column_counts: Record<string, number>
  coordinators_all_time: Record<string, CoordinatorRow>
  qualified_all_time: Record<string, number>
  row_counts: { leads: number }
}
const golden = JSON.parse(readFileSync(join(repo, "spec/real_data/golden.json"), "utf8")) as {
  agencies: { harbor: AgencyGolden; lakeside: AgencyGolden }
}
const harbor = golden.agencies.harbor
const lakeside = golden.agencies.lakeside

type CsvPath = string
/** Absolute paths, not buffers: Playwright refuses an in-memory part larger than 50 MB (Lakeside). */
const exportFiles = (dir: string): CsvPath[] => EXPORT_FILES.map((name) => join(dir, name))

const int = (value: number) => new Intl.NumberFormat("en-US").format(value)
const pct = (value: number, digits = 1) => `${Number(value.toFixed(digits)).toFixed(digits)}%`

/** The value inside the KPI card whose label is `label`. */
const kpi = (page: Page, label: string) => page.getByText(label, { exact: true }).locator("..")

async function signUpAndLoad(
  page: Page,
  options: { email: string; agency: string; timezone: string; definition: string; files: CsvPath[] },
): Promise<void> {
  await page.goto("/signup")
  await page.getByLabel("Your name").fill("Real Data Owner")
  await page.getByLabel("Work email").fill(options.email)
  await page.getByLabel("Password").fill("long-enough-pass")
  await page.getByRole("button", { name: "Continue" }).click()

  await expect(page.getByRole("heading", { name: "Set up your agency" })).toBeVisible()
  await page.getByLabel("Agency name").fill(options.agency)
  await page.getByRole("button", { name: options.timezone }).click()
  await page.getByText(options.definition, { exact: false }).first().click()
  await page.getByRole("button", { name: "Continue" }).click()

  await expect(page.getByRole("heading", { name: "Load your data" })).toBeVisible()
  await page.getByLabel("CSV files").setInputFiles(options.files)
  await expect(page.getByText("Review changes")).toBeVisible({ timeout: 120_000 })
  await expect(page.getByText(`Files matched to ${options.agency} 7 of 7`)).toBeVisible()
  await page.getByRole("button", { name: "Load data" }).click()
  await expect(page.getByText("Your data is loaded")).toBeVisible({ timeout: 150_000 })

  await page.getByRole("button", { name: "Continue" }).click()
  await expect(page.getByRole("heading", { name: "Invite your team" })).toBeVisible()
  await page.getByRole("link", { name: "Open my dashboard" }).click()
  await expect(page.locator("[data-shell]")).toBeVisible({ timeout: 30_000 })
}

/** The 12-month KPIs against the oracle. */
async function expectWeeklyGolden(page: Page, expected: { leads: number; qualified: number; rate: number }) {
  await page.getByRole("button", { name: "12 months" }).click()
  await expect(kpi(page, "Leads").getByText(int(expected.leads), { exact: true })).toBeVisible({ timeout: 30_000 })
  await expect(kpi(page, "Qualified").getByText(int(expected.qualified), { exact: true })).toBeVisible()
  await expect(kpi(page, "Qualified rate").getByText(pct(expected.rate), { exact: true })).toBeVisible()
}

test.describe("@real journey 6 — real exports at sign-up", () => {
  test.skip(process.env.E2E_API !== "real" || !exportsPresent, "needs E2E_API=real and handoff/takehome/exports")

  test("Harbor: a new agency loads the real export and shows the golden numbers", async ({ page }, testInfo) => {
    test.setTimeout(600_000)
    const viewport = viewportName(testInfo)
    // The agency name carries the viewport, so the prefix is exact per project: it can never match
    // the other viewport's agency (`E2E Real Harbor mobile` vs `… desktop`).
    reset(`E2E Real Harbor ${viewport}`)
    await signUpAndLoad(page, {
      email: `real-harbor+${viewport}@example.test`,
      agency: `E2E Real Harbor ${viewport}`,
      timezone: "Pacific",
      definition: "Attended a consult",
      files: exportFiles(harborDir),
    })

    // This week, 12 months (the documented Harbor config: attended a consult + Pacific).
    await expectWeeklyGolden(page, {
      leads: harbor.summary["12m"].leads,
      qualified: harbor.summary["12m"].qualified,
      rate: harbor.summary["12m"].qualified_rate,
    })
    await expectNoHorizontalScroll(page)
    await page.screenshot({ path: shot("real-harbor-01-week", testInfo), fullPage: true })

    // Funnel, 12 months: every row against the oracle.
    await page.goto("/funnel?range=12m")
    await expect(page.getByText(`${int(harbor.funnel_12m.total)} leads`, { exact: true })).toBeVisible({ timeout: 30_000 })
    for (const [label, count] of [
      ["Inquiry", harbor.funnel_12m.counts.inquiry],
      ["Application", harbor.funnel_12m.counts.application],
      ["Consult booked", harbor.funnel_12m.counts.consult_booked],
      ["Attended consult", harbor.funnel_12m.counts.consult_attended],
      ["Records", harbor.funnel_12m.counts.records],
      ["Accepted", harbor.funnel_12m.counts.accepted],
    ] as [string, number][]) {
      await expect(page.getByRole("listitem").filter({ hasText: label }).first()).toContainText(int(count))
    }
    await page.screenshot({ path: shot("real-harbor-02-funnel", testInfo), fullPage: true })

    // Channels, 12 months: each channel's leads, plus the two insights.
    await page.goto("/channels?range=12m")
    const channelRow = (channel: string) =>
      isDesktop(page) ? page.getByRole("row").filter({ hasText: channel }).first() : page.getByRole("button").filter({ hasText: channel }).first()
    for (const [channel, row] of Object.entries(harbor.channels_12m)) {
      await expect(channelRow(channel)).toContainText(int(row.leads), { timeout: 20_000 })
    }
    await expect(page.getByText(`${int(harbor.insights_12m.unattributed.count)} leads arrived without a channel`)).toBeVisible()
    await expect(page.getByText(new RegExp(`${int(harbor.insights_12m.out_of_area.count)} leads from outside`))).toBeVisible()
    await page.screenshot({ path: shot("real-harbor-03-channels", testInfo), fullPage: true })

    // Pipeline: the board column counts.
    await page.goto("/pipeline")
    const columns: [string, number][] = [
      ["Action needed", harbor.board_column_counts.action_needed],
      ["In application", harbor.board_column_counts.in_application],
      ["Consult", harbor.board_column_counts.consult],
      ["Qualified", harbor.board_column_counts.qualified],
    ]
    if (isDesktop(page)) {
      for (const [name, count] of columns) {
        await expect(page.getByRole("region", { name }).getByTestId("column-count")).toHaveText(int(count), { timeout: 30_000 })
      }
    } else {
      const chips = page.getByRole("group", { name: "Pipeline columns" })
      for (const [name, count] of columns) {
        await expect(chips.getByRole("button", { name: `${name}, ${int(count)}` })).toBeVisible({ timeout: 30_000 })
      }
    }
    await page.screenshot({ path: shot("real-harbor-04-pipeline", testInfo) })

    // Coordinators: Dana's card against the oracle.
    const dana = harbor.coordinators_all_time["Dana Ortiz"]
    await page.goto("/coordinators")
    const card = page.getByRole("link", { name: /Dana Ortiz/ })
    await expect(card).toContainText(`${int(dana.leads)} leads`, { timeout: 30_000 })
    await expect(card).toContainText(pct(dana.qualified_rate))
    await expect(card.getByText(int(dana.overdue), { exact: true })).toBeVisible()
    await page.screenshot({ path: shot("real-harbor-05-coordinators", testInfo), fullPage: true })

    // Next actions totals: the route is coordinator-only and coordinator-scoped, so the agency-wide
    // queues are read from the owner-authenticated API the screen renders.
    const queues = await page.request.get("/api/v1/next_actions")
    expect(queues.status()).toBe(200)
    const payload = (await queues.json()) as { queues: { key: string; count: number }[] }
    expect(Object.fromEntries(payload.queues.map((queue) => [queue.key, queue.count]))).toEqual(harbor.queues_all_leads)
  })

  test("Lakeside: the records config and Central time zone produce the golden numbers", async ({ page }, testInfo) => {
    test.setTimeout(900_000)
    const viewport = viewportName(testInfo)
    reset(`E2E Real Lakeside ${viewport}`)
    await signUpAndLoad(page, {
      email: `real-lakeside+${viewport}@example.test`,
      agency: `E2E Real Lakeside ${viewport}`,
      timezone: "Central",
      definition: "Reached medical records",
      files: exportFiles(lakesideDir),
    })

    await expectWeeklyGolden(page, {
      leads: lakeside.summary["12m"].leads,
      qualified: lakeside.summary["12m"].qualified,
      rate: lakeside.summary["12m"].qualified_rate,
    })
    await expectNoHorizontalScroll(page)
    await page.screenshot({ path: shot("real-lakeside-01-week", testInfo), fullPage: true })

    // Coordinators cover every lead in the snapshot: each card against the oracle.
    await page.goto("/coordinators")
    for (const [name, row] of Object.entries(lakeside.coordinators_all_time)) {
      await expect(page.getByRole("link", { name: new RegExp(name) })).toContainText(`${int(row.leads)} leads`, { timeout: 30_000 })
    }
    await page.screenshot({ path: shot("real-lakeside-02-coordinators", testInfo), fullPage: true })
  })

  test("a second agency re-uploads Harbor's files without touching the first", async ({ page, browser }, testInfo) => {
    test.setTimeout(900_000)
    const viewport = viewportName(testInfo)
    const baseURL = String(testInfo.project.use.baseURL)

    // Both agencies are created HERE: this test must not depend on the first test's account.
    // Agency A: harbor's files under "Attended a consult" + Pacific → 496 qualified.
    reset(`E2E Real Isol A ${viewport}`)
    await signUpAndLoad(page, {
      email: `real-isol-a+${viewport}+${Date.now()}@example.test`,
      agency: `E2E Real Isol A ${viewport}`,
      timezone: "Pacific",
      definition: "Attended a consult",
      files: exportFiles(harborDir),
    })
    await page.getByRole("button", { name: "12 months" }).click()
    await expect(kpi(page, "Qualified").getByText(int(harbor.qualified_all_time.consult_attended), { exact: true })).toBeVisible({
      timeout: 30_000,
    })

    // Agency B: the same files under "Submitted an application" + Mountain → 674 qualified.
    const context = await browser.newContext({ viewport: page.viewportSize() ?? undefined, baseURL })
    const second = await context.newPage()
    reset(`E2E Real Isol B ${viewport}`)
    await signUpAndLoad(second, {
      email: `real-isol-b+${viewport}+${Date.now()}@example.test`,
      agency: `E2E Real Isol B ${viewport}`,
      timezone: "Mountain",
      definition: "Submitted an application",
      files: exportFiles(harborDir),
    })
    await second.getByRole("button", { name: "12 months" }).click()
    await expect(kpi(second, "Qualified").getByText(int(harbor.qualified_all_time.application_submitted), { exact: true })).toBeVisible({
      timeout: 30_000,
    })
    await second.screenshot({ path: shot("real-isolation-01-second-agency", testInfo), fullPage: true })

    // Agency A is unchanged by agency B's load of the same files.
    await page.reload()
    await page.getByRole("button", { name: "12 months" }).click()
    await expect(kpi(page, "Qualified").getByText(int(harbor.qualified_all_time.consult_attended), { exact: true })).toBeVisible()
    await page.screenshot({ path: shot("real-isolation-02-first-unchanged", testInfo), fullPage: true })
    await context.close()
  })

  test("resumes a reload mid-load and reopens the upload after closing it", async ({ page }, testInfo) => {
    test.setTimeout(900_000)
    const viewport = viewportName(testInfo)
    reset(`E2E Real Resilience ${viewport}`)
    await signUpAndLoad(page, {
      email: `real-resilience+${viewport}@example.test`,
      agency: `E2E Real Resilience ${viewport}`,
      timezone: "Pacific",
      definition: "Attended a consult",
      files: exportFiles(harborDir),
    })

    // Start a second load, then reload the browser while it imports: the page must resume it. The
    // CRM card shows the pending strip; waiting for it to clear proves *this* load finished (the
    // rows are the same as the previous snapshot's, so the count alone cannot tell them apart).
    await page.goto("/data")
    await page.getByRole("button", { name: "Upload new snapshot" }).click()
    await page.getByLabel("CSV files").setInputFiles(exportFiles(harborDir))
    await expect(page.getByText("Review changes")).toBeVisible({ timeout: 120_000 })
    await page.getByRole("button", { name: "Replace snapshot" }).click()
    await page.reload()

    await expect(page.getByTestId("crm-exports")).not.toContainText(/Loading your data/, { timeout: 240_000 })
    await expect(page.getByTestId("crm-exports")).toContainText(`${int(harbor.row_counts.leads)} rows`)
    await page.screenshot({ path: shot("real-resilience-01-resumed", testInfo), fullPage: true })

    // Closing the modal mid-load keeps the load running; reopening resumes the same upload.
    await page.getByRole("button", { name: "Upload new snapshot" }).click()
    await page.getByLabel("CSV files").setInputFiles(exportFiles(harborDir))
    await page.getByRole("button", { name: "Close" }).click()
    await expect(page.getByTestId("crm-exports")).toContainText(/Loading your data/, { timeout: 30_000 })
    await page.getByRole("button", { name: "Upload new snapshot" }).click()
    await expect(page.getByRole("dialog")).toContainText("Review changes", { timeout: 120_000 })
    await page.getByRole("button", { name: "Cancel" }).click()
    await expect(page.getByRole("dialog")).toHaveCount(0)
    await page.screenshot({ path: shot("real-resilience-02-reopened", testInfo), fullPage: true })
  })
})

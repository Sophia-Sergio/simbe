import { expect, test } from "@playwright/test"
import type { Page } from "@playwright/test"
import {
  axeViolations,
  documentOverflow,
  elementOverflow,
  focusOrder,
  fonts,
  reducedMotion,
  tapTargets,
} from "./checks"
import type { Violation } from "./checks"
import { writeReport } from "./report"
import type { Cell } from "./report"
import { WIDTHS, screens, shellAt } from "./screens"
import type { Screen, ScreenRole } from "./screens"

// W3-3 audit harness (plan 2162 task 1). Runs when E2E_API=real (the plan's "Done when") or when
// E2E_AUDIT=1 is set, so the default `make verify` Playwright pass and the CI e2e_mock job stay fast
// — the report is a deliverable, not a per-PR gate.
const REAL = process.env.E2E_API === "real"
const ENABLED = REAL || process.env.E2E_AUDIT === "1"
const PASSWORD = REAL ? "simbe-dev-pass" : "x"
const OWNER = "erin@harbor.test"
const COORDINATOR = "dana@harbor.test"

const runnable = (screen: Screen) => !(screen.mockOnly && REAL)

/** Cells collected across the file's tests in this worker; written to the report in afterAll. */
const cells: Cell[] = []

async function signIn(page: Page, role: "owner" | "coordinator") {
  await page.goto("/signin")
  await page.getByLabel("Email").fill(role === "owner" ? OWNER : COORDINATOR)
  await page.getByLabel("Password").fill(PASSWORD)
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page.locator("[data-shell]")).toBeVisible({ timeout: 30_000 })
}

async function auditScreen(page: Page, screen: Screen, project: string, role: ScreenRole): Promise<void> {
  const mode = REAL ? "real" : "mock"
  if (screen.role === "public") {
    // A wizard step signs the new agency in; a later public screen must start from a clean session.
    await page.context().clearCookies()
    await page.goto("/signin")
    await page.evaluate(() => window.localStorage.clear())
  }
  await page.goto(REAL && screen.realPath ? screen.realPath : screen.path)
  if (screen.drive) await screen.drive(page, screen.id)
  await page.waitForSelector(screen.ready, { state: "visible", timeout: 30_000 })
  // Slide/fade entrances shift and fade panels for 200ms; measure the settled screen, not a transition
  // frame (a translucent panel blends text into a false contrast failure and a translated one "overflows").
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll('[role="dialog"]')).every((el) => getComputedStyle(el).opacity === "1"),
    undefined,
    { timeout: 10_000 },
  )
  await page.waitForTimeout(50)

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: width >= 860 ? 800 : 844 })
    if (screen.role === "public") {
      // Signed-out screens have no shell to wait for; the CSS-only layouts settle on the next frame.
      await page.waitForTimeout(50)
    } else {
      // The shells swap at 860px: wait for the one this width must render before measuring.
      await expect(page.locator("[data-shell]")).toHaveAttribute("data-shell", shellAt(width), { timeout: 15_000 })
    }

    const issues: Violation[] = [
      ...(await documentOverflow(page)),
      ...(await elementOverflow(page)),
      ...(width < 860 ? await tapTargets(page) : []),
      ...(await axeViolations(page)),
      ...(width === 390 || width === 1280 ? await focusOrder(page) : []),
      ...(await fonts(page)),
      ...(await reducedMotion(page)),
    ]
    cells.push({ mode, project, role, screen: screen.id, width, issues })
    const label = `${project} · ${screen.id} @ ${width}px`
    // One concise soft assertion per cell: a large object diff for every failing cell drowns the run.
    expect.soft(issues.length === 0, `${label}\n${issues.map((issue) => `  - ${issue.rule}: ${issue.detail}`).join("\n")}`).toBe(true)
  }
}

function testsFor(role: ScreenRole) {
  test(`${role} screens × the nine widths`, async ({ page }, testInfo) => {
    test.setTimeout(Number(process.env.AUDIT_TIMEOUT ?? 1_800_000))
    test.skip(!ENABLED, "audit runs with E2E_AUDIT=1 or E2E_API=real")
    const roleScreens = screens.filter((screen) => screen.role === role && runnable(screen))
    test.skip(!roleScreens.length, `no ${role} screen runs in this mode`)
    if (role !== "public") await signIn(page, role)
    for (const screen of roleScreens) await auditScreen(page, screen, testInfo.project.name, role)
  })
}

test.describe("audit", () => {
  testsFor("public")
  testsFor("owner")
  testsFor("coordinator")

  test.afterAll(() => {
    if (ENABLED && cells.length) writeReport(cells)
  })
})

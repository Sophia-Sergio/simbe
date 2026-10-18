import { expect, test } from "@playwright/test"
import type { Locator, Page } from "@playwright/test"
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
/** Dana Ortiz's lead in the Alpha fixtures (the same id seed as the mock contract examples). */
const LEAD_L4 = "aaaaaaaa-0000-4000-8000-000000000004"

const runnable = (screen: Screen) => !(screen.mockOnly && REAL)
const mode = REAL ? "real" : "mock"

/** Cells collected across the file's tests in this worker; written to the report in afterAll. */
const cells: Cell[] = []

async function signIn(page: Page, role: "owner" | "coordinator") {
  await page.goto("/signin")
  await page.getByLabel("Email").fill(role === "owner" ? OWNER : COORDINATOR)
  await page.getByLabel("Password").fill(PASSWORD)
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page.locator("[data-shell]")).toBeVisible({ timeout: 30_000 })
}

const settle = (page: Page) =>
  page.waitForFunction(
    () => Array.from(document.querySelectorAll('[role="dialog"]')).every((el) => getComputedStyle(el).opacity === "1"),
    undefined,
    { timeout: 10_000 },
  )

async function auditScreen(page: Page, screen: Screen, project: string, role: ScreenRole): Promise<void> {
  const path = REAL && screen.realPath ? screen.realPath : screen.path
  const openScreen = async (width: number) => {
    await page.goto(path)
    if (screen.role !== "public") {
      // The shells (and the desktop ⌘K handler) mount only after the session loads. Wait for the shell this
      // width renders before driving: a keyboard chord sent before the handler exists is lost, and a click
      // can land on the sign-in screen instead of the app.
      await expect(page.locator("[data-shell]")).toHaveAttribute("data-shell", shellAt(width), { timeout: 30_000 })
    }
    if (screen.drive) await screen.drive(page, screen.id)
    await page.waitForSelector(screen.ready, { state: "visible", timeout: 30_000 })
    // Slide/fade entrances shift and fade panels for 200ms; measure the settled screen, not a transition
    // frame (a translucent panel blends text into a false contrast failure and a translated one "overflows").
    await settle(page)
  }

  if (screen.role === "public") {
    // A wizard step signs the new agency in; a later public screen must start from a clean session.
    await page.context().clearCookies()
    await page.goto("/signin")
    await page.evaluate(() => window.localStorage.clear())
  }
  // A driven screen is reopened when the 860px shell changes: page-local dialogs (and the page behind
  // them) unmount on the swap, so the modal must be re-opened in the shell that is being measured.
  // A `driveOnce` screen (a stateful server-side upload) is driven only at the first width.
  await page.setViewportSize({ width: WIDTHS[0], height: 844 })
  await openScreen(WIDTHS[0])
  let drivenShell: ReturnType<typeof shellAt> | null = screen.drive ? shellAt(WIDTHS[0]) : null

  for (const width of WIDTHS) {
    const shell = shellAt(width)
    const needsDrive = Boolean(screen.drive) && !screen.driveOnce && screen.role !== "public" && shell !== drivenShell
    await page.setViewportSize({ width, height: width >= 860 ? 800 : 844 })
    if (needsDrive) {
      await openScreen(width)
      drivenShell = shell
    }
    if (screen.role === "public") {
      // Signed-out screens have no shell to wait for; the CSS-only layouts settle on the next frame.
      await page.waitForTimeout(50)
    } else {
      // The shells swap at 860px: wait for the one this width must render before measuring.
      await expect(page.locator("[data-shell]")).toHaveAttribute("data-shell", shellAt(width), { timeout: 15_000 })
    }
    // Measure the resting UI: park the pointer so a hover style (and its colour transition) is not sampled.
    await page.mouse.move(0, 0)

    const issues: Violation[] = [
      ...(await documentOverflow(page)),
      ...(await elementOverflow(page)),
      ...(width < 860 ? await tapTargets(page) : []),
      ...(await axeViolations(page)),
      ...(width === 390 || width === 1280 ? await focusOrder(page) : []),
      ...(await fonts(page)),
      ...(await reducedMotion(page)),
    ]
    cells.push({ mode, project, role, suite: "screens", screen: screen.id, width, issues })
    // Task 3 parity artefacts: the two review widths, side by side with handoff/design/screenshots/*.
    // Best-effort: a slow full-page capture must not turn a layout finding into a timeout.
    if (width === 390 || width === 1280) {
      await page.screenshot({ path: `e2e/screenshots/audit-${screen.id}-${width}.png`, fullPage: true, timeout: 15_000 }).catch(() => {})
    }
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

/** The class attribute that declares an iOS safe-area inset (headless resolves env() to 0, so assert the source). */
const hasSafeAreaInset = async (element: Locator): Promise<boolean> => {
  const className = (await element.getAttribute("class")) ?? ""
  return className.includes("env(safe-area-inset-bottom)") || className.includes("env(safe-area-inset-top)")
}

test.describe("responsive", () => {
  test("859↔860 keeps the route, the open lead panel and its scroll position", async ({ page }, testInfo) => {
    test.setTimeout(Number(process.env.AUDIT_TIMEOUT ?? 300_000))
    test.skip(!ENABLED, "audit runs with E2E_AUDIT=1 or E2E_API=real")
    await signIn(page, "owner")
    await page.setViewportSize({ width: 859, height: 844 })
    await page.goto(`/pipeline?lead=${LEAD_L4}&tab=screener`)
    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible({ timeout: 30_000 })
    await settle(page)
    await expect(page.locator("[data-shell]")).toHaveAttribute("data-shell", "mobile")

    // Scroll the panel's own scroll container (or the page if the panel fits) and remember how to find it.
    const before = await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"] *'))
      const scroller = nodes.find(
        (el) => el.scrollHeight > el.clientHeight + 20 && /(auto|scroll)/.test(getComputedStyle(el).overflowY),
      )
      if (scroller) {
        scroller.setAttribute("data-audit-scroller", "1")
        scroller.scrollTop = 120
        return {
          kind: "element" as const,
          index: nodes.indexOf(scroller),
          value: scroller.scrollTop,
          max: scroller.scrollHeight - scroller.clientHeight,
          name: scroller.className.slice(0, 60),
        }
      }
      window.scrollTo(0, 120)
      return { kind: "window" as const, index: -1, value: window.scrollY, max: 0, name: "window" }
    })
    const route = new URL(page.url()).pathname + new URL(page.url()).search
    const issues: Violation[] = []
    if (before.value < 1) issues.push({ rule: "responsive", detail: "the lead panel and page did not scroll before the resize" })
    // The panel's content is shorter at 860 (a 620px side panel) than at 859 (full screen), so a valid
    // offset can legitimately clamp when the content fits; it must never reset while the content scrolls.
    let expectedTop = before.value

    for (const [width, shell] of [
      [860, "desktop"],
      [859, "mobile"],
    ] as const) {
      await page.setViewportSize({ width, height: width >= 860 ? 800 : 844 })
      await expect(page.locator("[data-shell]")).toHaveAttribute("data-shell", shell, { timeout: 15_000 })
      await settle(page)
      const after = new URL(page.url()).pathname + new URL(page.url()).search
      if (after !== route) issues.push({ rule: "responsive", detail: `route changed at ${width}px: ${route} -> ${after}` })
      if (!(await dialog.isVisible())) issues.push({ rule: "responsive", detail: `the lead panel closed at ${width}px` })
      const state = await page.evaluate(() => {
        const tagged = document.querySelector<HTMLElement>('[data-audit-scroller="1"]')
        if (tagged) {
          return {
            top: tagged.scrollTop,
            max: Math.max(0, tagged.scrollHeight - tagged.clientHeight),
            present: true,
            name: tagged.className.slice(0, 60),
          }
        }
        const nodes = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"] *'))
        const scroller = nodes.find(
          (el) => el.scrollHeight > el.clientHeight + 20 && /(auto|scroll)/.test(getComputedStyle(el).overflowY),
        )
        return {
          top: scroller ? scroller.scrollTop : window.scrollY,
          max: scroller ? Math.max(0, scroller.scrollHeight - scroller.clientHeight) : 0,
          present: false,
          name: scroller?.className.slice(0, 60) ?? "window",
        }
      })
      expectedTop = Math.min(expectedTop, state.max)
      if (Math.abs(state.top - expectedTop) > 1) {
        issues.push({
          rule: "responsive",
          detail: `scrollTop at ${width}px is ${state.top}, expected ${expectedTop} (before ${before.value}, max ${state.max}; ${before.name} -> ${state.name}${state.present ? "" : ", original scroller no longer in the DOM"})`,
        })
      }
    }

    cells.push({ mode, project: testInfo.project.name, role: "owner", suite: "responsive", screen: "responsive-859-860", width: 860, issues })
    expect.soft(issues.length === 0, issues.map((issue) => `  - ${issue.rule}: ${issue.detail}`).join("\n")).toBe(true)
  })

  test("safe-area insets are declared on the fixed chrome", async ({ page }, testInfo) => {
    test.setTimeout(Number(process.env.AUDIT_TIMEOUT ?? 300_000))
    test.skip(!ENABLED, "audit runs with E2E_AUDIT=1 or E2E_API=real")
    await signIn(page, "owner")
    await page.setViewportSize({ width: 390, height: 844 })
    const issues: Violation[] = []

    await page.goto("/")
    const tabs = page.getByRole("navigation", { name: "Tabs" })
    await expect(tabs).toBeVisible({ timeout: 30_000 })
    if (!(await hasSafeAreaInset(tabs))) issues.push({ rule: "safe-area", detail: "the bottom tab bar does not declare env(safe-area-inset-bottom)" })
    const position = await tabs.evaluate((el) => getComputedStyle(el).position)
    if (position !== "fixed") issues.push({ rule: "safe-area", detail: `the bottom tab bar is ${position}, not fixed` })

    await page.goto("/data")
    await page.getByRole("button", { name: "Upload new snapshot" }).click()
    const modal = page.getByRole("dialog")
    await expect(modal).toBeVisible({ timeout: 30_000 })
    if (!(await hasSafeAreaInset(modal))) issues.push({ rule: "safe-area", detail: "the mobile bottom-sheet modal does not declare env(safe-area-inset-bottom)" })
    await page.keyboard.press("Escape")

    await page.goto(`/pipeline?lead=${LEAD_L4}&tab=summary`)
    const panel = page.getByRole("dialog")
    await expect(panel).toBeVisible({ timeout: 30_000 })
    if (!(await hasSafeAreaInset(panel))) issues.push({ rule: "safe-area", detail: "the full-screen lead panel does not declare env(safe-area-inset-bottom)" })

    cells.push({ mode, project: testInfo.project.name, role: "owner", suite: "responsive", screen: "safe-area", width: 390, issues })
    expect.soft(issues.length === 0, issues.map((issue) => `  - ${issue.rule}: ${issue.detail}`).join("\n")).toBe(true)
  })
})

test.describe("audit", () => {
  testsFor("public")
  testsFor("owner")
  testsFor("coordinator")
})

// File-level: runs once per worker after every describe, so the responsive cells are written too.
test.afterAll(() => {
  if (ENABLED && cells.length) writeReport(cells)
})

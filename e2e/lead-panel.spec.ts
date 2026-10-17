import { expect, test } from "@playwright/test"
import type { Page } from "@playwright/test"

// Lead slide-over, mock mode (no Rails, no Docker). The panel opens purely from the URL
// (?lead=&tab=), which is what the Pipeline, Coordinators and Next actions lanes do too.
const OWNER = "erin@harbor.test"
const COORDINATOR = "dana@harbor.test"
const L4 = "aaaaaaaa-0000-4000-8000-000000000004" // Dana Ortiz's lead
const L7 = "aaaaaaaa-0000-4000-8000-000000000007" // Priya Shah's lead

async function signIn(page: Page, email: string) {
  await page.goto("/signin")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill("x")
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page.locator("[data-shell]")).toBeVisible()
}

const viewportOf = (project: string) => (project.includes("mobile") ? "mobile" : "desktop")

test("owner: summary, then screener with verdicts and no raw answers", async ({ page }, testInfo) => {
  await signIn(page, OWNER)
  await page.goto(`/?lead=${L4}`)

  const panel = page.getByRole("dialog")
  await expect(panel).toBeVisible()
  await expect(panel.getByRole("heading", { name: "L4 Alpha" })).toBeVisible()
  // The screenshots must show the settled slide-over, not a frame of the 200ms entrance.
  await expect(panel).toHaveCSS("opacity", "1")
  await expect(panel.getByText("Dana Ortiz")).toBeVisible()
  await expect(panel.getByText("Application · Nudge")).toBeVisible()
  await expect(panel.getByText("•••-••••-0004")).toBeVisible()
  await expect(panel.getByText(/10 met/)).toBeVisible()
  await expect(panel.getByRole("button", { name: "Book consult" })).toBeVisible()
  // can_contact is false for the owner: no contact actions and no Actions menu.
  await expect(panel.getByRole("link", { name: "Send text" })).toHaveCount(0)
  await expect(panel.getByRole("link", { name: "Call" })).toHaveCount(0)
  await expect(panel.getByTestId("mark-done")).toHaveCount(0)
  await page.screenshot({ path: `e2e/screenshots/lead-panel-summary-${viewportOf(testInfo.project.name)}.png` })

  await panel.getByRole("tab", { name: "Screener" }).click()
  await expect(page).toHaveURL(/tab=screener/)
  await expect(panel.getByTestId("screener-item")).toHaveCount(10)
  await expect(panel.getByTestId("screener-item").first()).toContainText("Met")
  await expect(panel.getByTestId("raw-answer")).toHaveCount(0)
  await expect(panel.getByText("Health answers are visible to the assigned coordinator only.")).toBeVisible()
  await page.screenshot({ path: `e2e/screenshots/lead-panel-screener-${viewportOf(testInfo.project.name)}.png` })

  await page.keyboard.press("Escape")
  await expect(panel).toBeHidden()
  await expect(page).not.toHaveURL(/lead=/)
})

test("coordinator: raw answers, contact links and a working Mark done", async ({ page }) => {
  await signIn(page, COORDINATOR)
  await page.goto(`/?lead=${L4}&tab=screener`)

  const panel = page.getByRole("dialog")
  await expect(panel).toBeVisible()
  await expect(panel.getByTestId("screener-item")).toHaveCount(10)
  await expect(panel.getByTestId("raw-answer")).toHaveCount(10)

  await panel.getByRole("tab", { name: "Summary" }).click()
  await expect(panel.getByRole("link", { name: "Send text" })).toHaveAttribute("href", "sms:555-0183-0004")
  await expect(panel.getByRole("link", { name: "Call" })).toHaveAttribute("href", "tel:555-0183-0004")

  const done = panel.getByTestId("mark-done")
  await expect(done).toHaveText("Mark done")
  await done.click()
  await expect(done).toHaveText("Done")
  await expect(done).toHaveAttribute("data-done", "true")
  await done.click()
  await expect(done).toHaveText("Mark done")
})

test("coordinator: another coordinator's lead is not available", async ({ page }) => {
  await signIn(page, COORDINATOR)
  await page.goto(`/?lead=${L7}`)

  const panel = page.getByRole("dialog")
  await expect(panel).toBeVisible()
  await expect(panel.getByText("This lead isn't available")).toBeVisible()
  await expect(panel.getByText("L7 Alpha")).toHaveCount(0)
})

test("mobile: a long email cannot widen the sheet", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mock-mobile", "390px layout only")
  await signIn(page, OWNER)
  await page.goto(`/?lead=${L4}`)

  const panel = page.getByRole("dialog")
  await expect(panel).toBeVisible()
  await expect(panel).toHaveCSS("opacity", "1")

  // Nothing inside the sheet may overflow sideways at 390px. An element that clips its own overflow
  // (`overflow-x: hidden`, i.e. a deliberate `truncate`) is skipped: clipping is the fix, not the bug.
  const worstOverflow = () =>
    panel.evaluate((el) => {
      const nodes = [el, ...Array.from(el.querySelectorAll<HTMLElement>("*"))].filter(
        (node) => node.clientWidth > 0 && getComputedStyle(node).overflowX !== "hidden",
      )
      return nodes
        .map((node) => ({
          tag: node.tagName.toLowerCase(),
          cls: node.className.toString().slice(0, 60),
          overflow: node.scrollWidth - node.clientWidth,
        }))
        .reduce((worst, node) => (node.overflow > worst.overflow ? node : worst), { tag: "", cls: "", overflow: 0 })
    })
  const withinPanel = async () => {
    const worst = await worstOverflow()
    expect(worst.overflow, `overflowing element: <${worst.tag} class="${worst.cls}">`).toBeLessThanOrEqual(0)
  }

  await withinPanel()

  // Stress the grid columns with an address longer than any fixture carries (the DOM swap is the only way
  // to reach this shape from the read-only contract fixtures; the assertion is still a real layout check).
  const longEmail = "averyveryverylongaddress.thatcannotwrap@an-extremely-long-domain-name.example.com"
  await panel.getByText("l4.alpha@example.com").evaluate((el, text) => {
    el.textContent = text as string
  }, longEmail)

  await withinPanel()
  const emailRight = await panel.getByText(longEmail).evaluate((el) => el.getBoundingClientRect().right)
  const panelRight = await panel.evaluate((el) => el.getBoundingClientRect().right)
  expect(emailRight).toBeLessThanOrEqual(panelRight)
})

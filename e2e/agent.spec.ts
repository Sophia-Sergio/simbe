import { expect, test } from "@playwright/test"
import type { Page } from "@playwright/test"

// "Ask Simbe" in the standalone mock host (no Rails, no Docker). The model is stubbed by the MSW
// handler: the answer fixture (`contracts/examples/agent/answer.json`) carries the chart, the
// "Open channels" action, the source chips and the follow-ups. Screenshots: agent-{desktop,mobile}.png.

async function signIn(page: Page, email: string) {
  await page.goto("/signin")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill("x")
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page.locator("[data-shell]")).toBeVisible()
}

const shot = (name: string, projectName: string) => `e2e/screenshots/${name}-${projectName.replace("mock-", "")}.png`
const panelOf = (page: Page) => page.getByRole("dialog", { name: "Ask Simbe" })

test("owner asks a starter question, sees the chart answer and follows the action", async ({ page }, testInfo) => {
  testInfo.skip(testInfo.project.name.includes("mobile"), "the FAB is the desktop entry point")

  await signIn(page, "erin@harbor.test")
  await page.getByRole("button", { name: "Ask Simbe" }).click()

  const panel = panelOf(page)
  await expect(panel).toBeVisible()
  await expect(panel.getByText("How can I help this week?")).toBeVisible()
  for (const chip of [
    "Which channel turns the most leads into qualified ones?",
    "Where do most applicants drop off?",
    "Which channel should I look at first?",
    "Who needs support on my team?",
  ]) {
    await expect(panel.getByRole("button", { name: chip })).toBeVisible()
  }

  await panel.getByRole("button", { name: "Which channel turns the most leads into qualified ones?" }).click()
  await expect(panel.getByText(/Facebook converts best/)).toBeVisible()
  await expect(panel.getByRole("img", { name: /Qualified rate by channel/ })).toBeVisible()
  await page.screenshot({ path: shot("agent", testInfo.project.name) })

  await panel.getByRole("button", { name: /Open channels/ }).click()
  await expect(page).toHaveURL(/\/channels/)
  await expect(panelOf(page)).toBeHidden()
})

test("'Ask why' on This week opens the panel with the question already sent", async ({ page }, testInfo) => {
  testInfo.skip(testInfo.project.name.includes("mobile"), "This week's recommendations are desktop layout")

  await signIn(page, "erin@harbor.test")
  await page.goto("/")
  await page.getByRole("button", { name: "Ask why" }).first().click()

  const panel = panelOf(page)
  await expect(panel.getByText("Why do leads stall before the application and what should we change?")).toBeVisible()
  await expect(panel.getByText(/Facebook converts best/)).toBeVisible()
})

test("the Ask tab opens the agent full screen on a phone and answers with a chart", async ({ page }, testInfo) => {
  testInfo.skip(!testInfo.project.name.includes("mobile"), "the Ask tab is the mobile entry point")

  await signIn(page, "erin@harbor.test")
  await page.getByRole("button", { name: "Ask" }).click()

  const panel = panelOf(page)
  await expect(panel).toBeVisible()
  await expect(panel).toHaveAttribute("data-variant", "full")
  const box = await panel.boundingBox()
  expect(box?.width).toBe(390)
  // Full screen from the top edge (the notch inset lives on the panel, not the viewport).
  expect(box?.y).toBe(0)
  expect(box?.height).toBeGreaterThan(800)

  await panel.getByRole("button", { name: "Which channel turns the most leads into qualified ones?" }).click()
  await expect(panel.getByText(/Facebook converts best/)).toBeVisible()
  await expect(panel.getByRole("img", { name: /Qualified rate by channel/ })).toBeVisible()
  await page.screenshot({ path: shot("agent", testInfo.project.name) })

  await panel.getByRole("button", { name: "Close" }).click()
  await expect(panelOf(page)).toBeHidden()
})

test("a coordinator gets their own three starter chips", async ({ page }, testInfo) => {
  testInfo.skip(!testInfo.project.name.includes("mobile"), "coordinator uses the Ask tab")

  await signIn(page, "dana@harbor.test")
  await page.getByRole("button", { name: "Ask" }).click()

  const panel = panelOf(page)
  await expect(panel.getByRole("button", { name: "Who should I text back first?" })).toBeVisible()
  await expect(panel.getByRole("button", { name: "Which leads are overdue?" })).toBeVisible()
  await expect(panel.getByRole("button", { name: "Where am I losing applicants?" })).toBeVisible()
})

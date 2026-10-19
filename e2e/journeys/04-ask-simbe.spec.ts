import { expect, test } from "@playwright/test"
import { signIn, signOut } from "../support/auth"
import { openAgent } from "../support/nav"
import { seed } from "../support/seed"
import { shot } from "../support/viewport"

// Journey 4 — "Ask Simbe" (Simbe Flows: "Ask about the business"): the owner opens the agent (FAB
// on desktop, Ask tab on mobile), picks a starter chip, reads the charted answer and follows its
// "Open channels" action; a coordinator sees only coordinator chips; a 501-character question shows
// the inline limit. Real stack only, with the model stubbed by `E2E_STUB_ANTHROPIC=1` in the Rails
// container (spec/fixtures/agent/e2e_answer.json) so the answer is deterministic.
//
// The journeys share the seeded `harbor` agency, so the suite runs serially (see the plan's
// Done-when note).

const OWNER_CHIPS = [
  "Which channel turns the most leads into qualified ones?",
  "Where do most applicants drop off?",
  "Which channel should I look at first?",
  "Who needs support on my team?",
]

const COORDINATOR_CHIPS = [
  "What should I do first today?",
  "Which leads have been waiting longest?",
  "How many next actions do I have left?",
]

test.describe("journey 4 — Ask Simbe", () => {
  test.skip(process.env.E2E_API !== "real", "journeys run against the real stack (E2E_API=real)")

  test("the owner gets a charted answer it can act on, a coordinator gets her own chips, and long text is capped", async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    seed()

    await signIn(page, "owner")
    const panel = await openAgent(page)
    await expect(panel.getByText("How can I help this week?")).toBeVisible()
    for (const chip of OWNER_CHIPS) await expect(panel.getByRole("button", { name: chip })).toBeVisible()
    await page.screenshot({ path: shot("agent-01-owner-open", testInfo) })

    // The stubbed answer: text, an inline chart and the navigation action.
    await panel.getByRole("button", { name: OWNER_CHIPS[0] }).click()
    await expect(panel.getByText(/Facebook converts best/)).toBeVisible()
    await expect(panel.getByRole("img", { name: /Qualified rate by channel/ })).toBeVisible()
    await expect(panel.getByRole("button", { name: /Open channels/ })).toBeVisible()
    await page.screenshot({ path: shot("agent-02-answer", testInfo) })

    // A question over 500 characters is refused inline, before any request.
    const composer = panel.getByLabel("Ask about your business")
    await composer.fill("x".repeat(501))
    await expect(panel.getByText("Keep it under 500 characters.")).toBeVisible()
    await expect(panel.getByRole("button", { name: "Send" })).toBeDisabled()
    await page.screenshot({ path: shot("agent-03-too-long", testInfo) })
    await composer.fill("")

    // The action navigates and closes the agent.
    await panel.getByRole("button", { name: /Open channels/ }).click()
    await expect(page).toHaveURL(/\/channels/)
    await expect(page.getByRole("dialog", { name: "Ask Simbe" })).toBeHidden()

    // A coordinator gets only coordinator chips.
    await signOut(page)
    await signIn(page, "coordinator")
    const coordinatorPanel = await openAgent(page)
    for (const chip of COORDINATOR_CHIPS) await expect(coordinatorPanel.getByRole("button", { name: chip })).toBeVisible()
    for (const chip of OWNER_CHIPS) await expect(coordinatorPanel.getByRole("button", { name: chip })).toHaveCount(0)
    await page.screenshot({ path: shot("agent-04-coordinator-chips", testInfo) })
    await coordinatorPanel.getByRole("button", { name: "Close" }).click()
    await signOut(page)
  })
})

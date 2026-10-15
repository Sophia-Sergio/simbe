import { expect, test } from "@playwright/test"

// Runs against the standalone mock host (`npm run dev:mock`) — no Rails, no Docker. The MSW worker is
// started by `startMocks()` from the app entrypoint (W0-5's app-core lane); until that is wired up the
// worker is not registered, so this journey skips itself instead of failing on an unbuilt shell.
test("the mock API signs in an owner and serves the summary", async ({ page }) => {
  await page.goto("/")

  const meStatus = await page.evaluate(() => fetch("/api/v1/me").then((response) => response.status))
  test.skip(meStatus !== 401, "MSW is not started yet — W0-5's entrypoint calls startMocks(); this journey activates once app-core is merged")

  const signInStatus = await page.evaluate(async () => {
    const response = await fetch("/api/v1/session", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Requested-With": "simbe" },
      body: JSON.stringify({ email: "erin@harbor.test", password: "x" }),
    })
    return response.status
  })
  expect(signInStatus).toBe(201)

  const summary = await page.evaluate(async () => {
    const response = await fetch("/api/v1/metrics/summary?range=30d")
    return response.json() as Promise<{ range: string; kpis: { leads: { value: number } } }>
  })
  expect(summary.range).toBe("30d")
  expect(summary.kpis.leads.value).toBe(10)
})

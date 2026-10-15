import { expect, test } from "@playwright/test"

// Runs against the standalone mock host (`npm run dev:mock`) — no Rails, no Docker. The MSW worker is
// started by `startMocks()` from the app entrypoint (W0-5's app-core lane); until that is wired up this
// journey cannot pass. It is explicitly fixme'd rather than skipped at runtime: a runtime skip based on
// `/me` would also hide a dead worker AFTER W0-5 merges.
test("the mock API signs in an owner and serves the summary", async ({ page }) => {
  test.fixme(true, "Remove this line when W0-5 mounts the app: entrypoints/application.tsx must call startMocks()")

  await page.goto("/")
  expect(await page.evaluate(() => fetch("/api/v1/me").then((response) => response.status))).toBe(401)

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

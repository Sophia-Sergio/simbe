import { expect, test } from "@playwright/test"

// Runs against the standalone mock host (`npm run dev:mock`) — no Rails, no Docker. The MSW worker is
// started by `startMocks()` from the app entrypoint, so this journey fails loudly if the worker is dead.
test("the mock API signs in an owner and serves the summary", async ({ page }) => {
  await page.goto("/")
  // The worker takes control once the app has booted; wait for the sign-in screen before probing the API.
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible()
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

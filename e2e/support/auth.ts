import { expect } from "@playwright/test"
import type { Page } from "@playwright/test"

// Sign-in against the real stack. The mock projects use the MSW placeholder password `x`; the real
// API needs the logins `rails e2e:seed` creates (`lib/tasks/e2e.rake`).

/** The two seeded people the journeys act as. */
export type Who = "owner" | "coordinator"

const EMAIL: Record<Who, string> = {
  owner: "erin@harbor.test",
  coordinator: "dana@harbor.test",
}

/** The seeded dev password (`simbe-dev-pass`), overridable for a differently seeded stack. */
export const PASSWORD = process.env.E2E_PASSWORD ?? "simbe-dev-pass"

/**
 * Signs in and waits for the authenticated shell.
 *
 * Rack::Attack throttles sign-ins to 10/min/IP (`app/packs/identity/config/rack_attack/account.rb`),
 * so a burst of sign-ins across workers can be answered 429; one bounded wait-and-retry keeps the
 * journeys honest instead of flaky.
 */
export async function signIn(page: Page, who: Who, query = ""): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    await page.goto(`/signin${query}`)
    await page.getByLabel("Email").fill(EMAIL[who])
    await page.getByLabel("Password").fill(PASSWORD)
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/v1/session") && r.request().method() === "POST"),
      page.getByRole("button", { name: "Sign in" }).click(),
    ])
    if (response.status() === 429 && attempt < 2) {
      const retryAfter = Number(response.headers()["retry-after"] ?? "10")
      await page.waitForTimeout(Math.min(Math.max(retryAfter, 1), 30) * 1000)
      continue
    }
    break
  }
  await expect(page.locator("[data-shell]")).toBeVisible({ timeout: 20_000 })
}

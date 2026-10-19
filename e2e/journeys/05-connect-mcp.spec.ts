import { expect, test } from "@playwright/test"
import type { APIRequestContext, Page } from "@playwright/test"
import { PASSWORD, signIn } from "../support/auth"
import { navTo } from "../support/nav"
import { seed } from "../support/seed"
import { expectNoHorizontalScroll, shot } from "../support/viewport"

// Journey 5 — Connect Claude and MCP (Simbe Flows: "Connect Claude"): the owner generates a key
// (inline confirm), reads it from the DOM, and Claude's tools answer through POST /mcp/harbor —
// tools/list plus tools/call get_funnel; regenerating revokes the old key (401) and the new one
// works. It ends with the cross-agency check: a key is bound to one agency, so harbor's key is a
// 404 on lakeside's slug and lakeside's key is a 404 on harbor's. Real stack only.
//
// The journeys share the seeded `harbor` agency, so the suite runs serially (see the plan's
// Done-when note).

// Chromium denies clipboard writes by default; the key is read back from the clipboard.
test.use({ permissions: ["clipboard-read", "clipboard-write"] })

const FOUR_TOOLS = [
  "get_funnel",
  "get_channel_performance",
  "get_dropoff_reasons",
  "get_next_actions",
]

const jsonRpc = (request: APIRequestContext, slug: string, key: string, body: Record<string, unknown>) =>
  request.post(`/mcp/${slug}`, {
    headers: { Authorization: `Bearer ${key}` },
    data: { jsonrpc: "2.0", ...body },
  })

async function generateKey(page: Page, previous?: string): Promise<string> {
  await page.getByRole("button", { name: "Generate new key" }).click()
  await page.getByRole("group").getByRole("button", { name: "Generate new key" }).click()
  const field = page.getByLabel("API key", { exact: true })
  // A rotate replaces the shown key: the old value already matched the shape, so wait for the change.
  if (previous) await expect(field).not.toHaveValue(previous)
  await expect(field).toHaveValue(/^simbe_live_[A-Za-z0-9_-]{32}$/)
  await expect(page.getByText(/shown only once/i)).toBeVisible()
  const key = await field.inputValue()
  await expect(page.locator("pre")).toContainText(key)
  return key
}

/** Signs in any seeded login (journeys 1–5 use `signIn`; the second agency has its own owner). */
async function signInAs(page: Page, email: string): Promise<void> {
  await page.goto("/signin")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(PASSWORD)
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page.locator("[data-shell]")).toBeVisible({ timeout: 20_000 })
}

test.describe("journey 5 — Connect Claude and MCP", () => {
  test.skip(process.env.E2E_API !== "real", "journeys run against the real stack (E2E_API=real)")

  test("generates a key, serves the MCP tools, and rotating revokes the old key", async ({ page, request, browser }, testInfo) => {
    test.setTimeout(180_000)
    seed()
    await signIn(page, "owner")
    await navTo(page, "Connect Claude")

    // The connection card: the agency's server URL and the four tools Claude may call.
    await expect(page.getByLabel("Server URL", { exact: true })).toHaveValue(/\/mcp\/harbor$/)
    for (const tool of FOUR_TOOLS) await expect(page.getByText(tool, { exact: true })).toBeVisible()
    await expectNoHorizontalScroll(page)
    await page.screenshot({ path: shot("connect-01-page", testInfo), fullPage: true })

    // Generate (inline confirm) and copy the key from the DOM.
    const key = await generateKey(page)
    await page.getByRole("button", { name: "Copy API key" }).click()
    await expect(page.getByTestId("toast")).toContainText("Copied")
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(key)
    await page.screenshot({ path: shot("connect-02-generated", testInfo), fullPage: true })

    // tools/list: the four tools.
    const list = await jsonRpc(request, "harbor", key, { id: 1, method: "tools/list", params: {} })
    expect(list.status()).toBe(200)
    const tools = ((await list.json()) as { result: { tools: { name: string }[] } }).result.tools.map((tool) => tool.name)
    expect(tools).toEqual(FOUR_TOOLS)

    // tools/call get_funnel: Alpha's 10 / 5 / 4 / 3 / 2 / 1.
    const call = await jsonRpc(request, "harbor", key, {
      id: 2,
      method: "tools/call",
      params: { name: "get_funnel", arguments: { range: "30d" } },
    })
    expect(call.status()).toBe(200)
    const payload = (await call.json()) as { result: { isError: boolean; content: { text: string }[] } }
    expect(payload.result.isError).toBe(false)
    const funnel = JSON.parse(payload.result.content[0].text) as { total: number; stages: { count: number }[] }
    expect(funnel.total).toBe(10)
    expect(funnel.stages.map((stage) => stage.count)).toEqual([10, 5, 4, 3, 2, 1])

    // Cross-agency: a key belongs to exactly one agency, so it is a 404 on another agency's slug
    // (the seeded `lakeside` agency is the second one; its owner is `owner@lakeside.test`).
    const baseURL = String(testInfo.project.use.baseURL)
    const lakesideContext = await browser.newContext({ viewport: page.viewportSize() ?? undefined, baseURL })
    const lakesidePage = await lakesideContext.newPage()
    await signInAs(lakesidePage, "owner@lakeside.test")
    await navTo(lakesidePage, "Connect Claude")
    const lakesideKey = await generateKey(lakesidePage)
    await lakesideContext.close()

    expect((await jsonRpc(request, "lakeside", key, { id: 5, method: "tools/list", params: {} })).status()).toBe(404)
    expect((await jsonRpc(request, "harbor", lakesideKey, { id: 6, method: "tools/list", params: {} })).status()).toBe(404)

    // Regenerate: the old key is revoked and the new one works.
    const rotated = await generateKey(page, key)
    expect(rotated).not.toBe(key)
    await page.screenshot({ path: shot("connect-03-rotated", testInfo), fullPage: true })

    const stale = await jsonRpc(request, "harbor", key, { id: 3, method: "tools/list", params: {} })
    expect(stale.status()).toBe(401)
    const fresh = await jsonRpc(request, "harbor", rotated, { id: 4, method: "tools/list", params: {} })
    expect(fresh.status()).toBe(200)
  })
})

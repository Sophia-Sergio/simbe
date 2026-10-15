import { mockApi, setViewport } from "./mockApi"

it("serves the default handler and overrides by method+path+query", async () => {
  const r1 = await fetch("/api/v1/metrics/summary?range=30d")
  expect((await r1.json()).kpis.leads.value).toBe(10)
  mockApi({ "GET /api/v1/metrics/summary?range=90d": { range: "90d", snapshot: null, kpis: {} } })
  expect((await (await fetch("/api/v1/metrics/summary?range=90d")).json()).range).toBe("90d")
  expect((await (await fetch("/api/v1/metrics/summary?range=30d")).json()).range).toBe("30d")
})

it("function overrides can return errors", async () => {
  mockApi({ "POST /api/v1/agent/messages": () => new Response(JSON.stringify({ error: { code: "already_in_progress", message: "x" } }), { status: 409 }) })
  expect((await fetch("/api/v1/agent/messages", { method: "POST", headers: { "X-Requested-With": "simbe" } })).status).toBe(409)
})

it("setViewport flips matchMedia and fires resize", () => {
  setViewport(390)
  expect(window.matchMedia("(min-width: 860px)").matches).toBe(false)
  setViewport(1280)
  expect(window.matchMedia("(min-width: 860px)").matches).toBe(true)
})

it("unhandled requests fail the test", async () => {
  await expect(fetch("/api/v1/nope")).rejects.toThrow()
})

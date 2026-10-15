import { db, OWNER_EMAIL } from "./db"
import { scenario, setScenario } from "./scenarios"
import { scenarioDelay, setMockDelay } from "./handlers/shared"

const asOwner = () => {
  db.session = { email: OWNER_EMAIL, role: "owner" }
}

afterEach(() => {
  setScenario("default")
  setMockDelay(1500)
})

it("defaults to the default scenario", () => {
  expect(scenario).toBe("default")
})

it("?mock=loading: /snapshots/current returns the loading fixture and data endpoints are empty", async () => {
  setScenario("loading")
  db.reset()
  asOwner()
  const current = await (await fetch("/api/v1/snapshots/current")).json()
  expect(current.snapshot).toBeNull()
  expect(current.pending?.upload_id).toBe("66666666-6666-4666-8666-666666666666")
  expect(current.pending?.status).toBe("committing")

  const summary = await (await fetch("/api/v1/metrics/summary?range=30d")).json()
  expect(summary.kpis.leads.value).toBe(0)
  const leads = await (await fetch("/api/v1/leads")).json()
  expect(leads.leads).toEqual([])
})

it("?mock=new: metrics become non-empty after a commit", async () => {
  setScenario("new")
  db.reset()
  asOwner()
  expect((await (await fetch("/api/v1/metrics/summary?range=30d")).json()).kpis.leads.value).toBe(0)
  db.snapshot = { snapshot: { id: "55555555-5555-4555-8555-555555555555", as_of: "2026-10-01T12:00:00.000Z", loaded_at: "2026-10-01T12:00:00.000Z", row_counts: {} }, pending: null, files: [] }
  expect((await (await fetch("/api/v1/metrics/summary?range=30d")).json()).kpis.leads.value).toBe(10)
})

it("?mock=error: a GET data endpoint returns 500 with the error envelope, /me still answers", async () => {
  setScenario("error")
  db.reset()
  asOwner()
  const res = await fetch("/api/v1/metrics/summary?range=30d")
  expect(res.status).toBe(500)
  expect((await res.json()).error.code).toBe("server_error")
  expect((await fetch("/api/v1/me")).status).toBe(200)
})

it("scenarioDelay waits the configured time only under ?mock=slow", async () => {
  vi.useFakeTimers()
  let slowDone = false
  setMockDelay(1000)
  setScenario("slow")
  const slow = scenarioDelay().then(() => {
    slowDone = true
  })
  await vi.advanceTimersByTimeAsync(999)
  expect(slowDone).toBe(false)
  await vi.advanceTimersByTimeAsync(2)
  await slow
  expect(slowDone).toBe(true)

  setScenario("default")
  await expect(scenarioDelay()).resolves.toBeUndefined()
  vi.useRealTimers()
})

it("?mock=slow: a request is held for the configured delay", async () => {
  vi.useFakeTimers()
  setScenario("slow")
  setMockDelay(1000)
  db.reset()
  asOwner()
  let settled = false
  const pending = fetch("/api/v1/me").then((response) => {
    settled = true
    return response.status
  })
  await vi.advanceTimersByTimeAsync(999)
  expect(settled).toBe(false)
  await vi.advanceTimersByTimeAsync(60)
  await expect(pending).resolves.toBe(200)
  expect(settled).toBe(true)
  vi.useRealTimers()
})

it("?mock=empty: sign-out stays signed out across a reset (reload)", async () => {
  setScenario("empty")
  db.reset()
  await fetch("/api/v1/session", { method: "DELETE", headers: { "X-Requested-With": "simbe" } })
  db.reset()
  expect(db.session).toBeNull()
  expect((await fetch("/api/v1/me")).status).toBe(401)
})

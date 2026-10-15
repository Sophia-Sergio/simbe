import { asRole } from "@/test/mockApi"

it("owner sees the Alpha summary", async () => {
  const body = await (await fetch("/api/v1/metrics/summary?range=30d")).json()
  expect(body.range).toBe("30d")
  expect(body.kpis.leads.value).toBe(10)
})

it("coordinator is 403 on a metrics route", async () => {
  asRole("coordinator")
  expect((await fetch("/api/v1/metrics/summary?range=30d")).status).toBe(403)
})

it("an out-of-range range is 422 bad_range", async () => {
  const res = await fetch("/api/v1/metrics/summary?range=7d")
  expect(res.status).toBe(422)
  expect((await res.json()).error.code).toBe("bad_range")
})

it("Facebook returns the fixture, other known channels are zeroed, unknown is 404", async () => {
  const facebook = await (await fetch("/api/v1/metrics/channels/Facebook?range=30d")).json()
  expect(facebook.channel).toBe("Facebook")
  expect(facebook.kpis.leads).toBe(3)

  const instagram = await (await fetch("/api/v1/metrics/channels/Instagram?range=30d")).json()
  expect(instagram.kpis.leads).toBe(0)
  expect(instagram.campaigns).toEqual([])

  expect((await fetch("/api/v1/metrics/channels/Nope?range=30d")).status).toBe(404)
})

it("recommendations are at most four", async () => {
  const body = await (await fetch("/api/v1/recommendations?range=30d")).json()
  expect(Array.isArray(body)).toBe(true)
  expect(body.length).toBeLessThanOrEqual(4)
})

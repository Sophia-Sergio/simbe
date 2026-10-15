import { asRole } from "@/test/mockApi"

const csrf = { "X-Requested-With": "simbe" }

it("GET /mcp returns the fixture prefix", async () => {
  const body = await (await fetch("/api/v1/mcp")).json()
  expect(body.url).toBe("https://mcp.simbe.app/harbor")
  expect(body.key_prefix).toBe("simbe_live_ab12")
})

it("rotate returns a fresh key once and stores the prefix", async () => {
  const res = await fetch("/api/v1/mcp/rotate", { method: "POST", headers: csrf })
  expect(res.status).toBe(201)
  const body = await res.json()
  expect(body.key).toMatch(/^simbe_live_[A-Za-z0-9]{24}$/)
  expect(body.key_prefix).toBe(body.key.slice(0, 18))
  const settings = await (await fetch("/api/v1/mcp")).json()
  expect(settings.key_prefix).toBe(body.key_prefix)
})

it("a coordinator gets 403", async () => {
  asRole("coordinator")
  expect((await fetch("/api/v1/mcp")).status).toBe(403)
})

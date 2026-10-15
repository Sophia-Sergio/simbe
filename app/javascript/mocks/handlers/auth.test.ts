import { db } from "@/mocks/db"

const json = (path: string, method: string, body?: unknown) =>
  fetch(path, {
    method,
    headers: { "Content-Type": "application/json", "X-Requested-With": "simbe" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

it("signs in erin@harbor.test as an owner", async () => {
  db.session = null
  const res = await json("/api/v1/session", "POST", { email: "erin@harbor.test", password: "x" })
  expect(res.status).toBe(201)
  expect((await res.json()).user.role).toBe("owner")
})

it("signs in dana@harbor.test as the Dana Ortiz coordinator", async () => {
  const res = await json("/api/v1/session", "POST", { email: "dana@harbor.test", password: "x" })
  expect(res.status).toBe(201)
  const body = await res.json()
  expect(body.user.role).toBe("coordinator")
  expect(body.user.coordinator_name).toBe("Dana Ortiz")
})

it("rejects an unknown email with 401 invalid_credentials", async () => {
  const res = await json("/api/v1/session", "POST", { email: "nobody@x.test", password: "x" })
  expect(res.status).toBe(401)
  expect((await res.json()).error.code).toBe("invalid_credentials")
})

it("GET /me is 401 without a session", async () => {
  db.session = null
  expect((await fetch("/api/v1/me")).status).toBe(401)
})

it("DELETE /session clears the session", async () => {
  expect((await json("/api/v1/session", "DELETE")).status).toBe(204)
  expect((await fetch("/api/v1/me")).status).toBe(401)
})

it("rejects a non-GET without the CSRF header", async () => {
  const res = await fetch("/api/v1/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
  expect(res.status).toBe(403)
})

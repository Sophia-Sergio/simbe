import { asRole } from "@/test/mockApi"
import { db } from "@/mocks/db"

const json = (path: string, method: string, body?: unknown) =>
  fetch(path, {
    method,
    headers: { "Content-Type": "application/json", "X-Requested-With": "simbe" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

it("coordinator is 403 on the owner-only team route", async () => {
  asRole("coordinator")
  expect((await fetch("/api/v1/team")).status).toBe(403)
})

it("inviting an unknown coordinator is 422 unknown_coordinator with valid_names", async () => {
  const res = await json("/api/v1/invitations", "POST", { email: "maya@harbor.test", coordinator_name: "Nobody" })
  expect(res.status).toBe(422)
  const body = await res.json()
  expect(body.error.code).toBe("unknown_coordinator")
  expect(body.valid_names).toContain("Dana Ortiz")
})

it("inviting a known coordinator is 201 with an accept_url and a pending row", async () => {
  const res = await json("/api/v1/invitations", "POST", { email: "maya@harbor.test", coordinator_name: "Jess Kim" })
  expect(res.status).toBe(201)
  const invitation = await res.json()
  expect(invitation.accept_url).toContain("http://localhost:5173/invite/")
  expect(db.team.invitations.some((row) => row.id === invitation.id)).toBe(true)
})

it("PATCH /agency updates the qualified milestone (owner)", async () => {
  const res = await json("/api/v1/agency", "PATCH", { qualified_milestone: "records" })
  expect(res.status).toBe(200)
  expect((await res.json()).qualified_milestone).toBe("records")
  expect(db.agency.qualified_milestone).toBe("records")
})

it("coordinator is 403 on PATCH /agency", async () => {
  asRole("coordinator")
  expect((await json("/api/v1/agency", "PATCH", { name: "Nope" })).status).toBe(403)
})

it("a coordinator may still READ the agency (the contract lists no 403 for GET)", async () => {
  asRole("coordinator")
  const res = await fetch("/api/v1/agency")
  expect(res.status).toBe(200)
  expect((await res.json()).slug).toBe("harbor")
})

it("DELETE /invitations/:id requires the CSRF header", async () => {
  expect((await fetch("/api/v1/invitations/44444444-4444-4444-8444-444444444444", { method: "DELETE" })).status).toBe(403)
})

it("DELETE /ad_connections/:platform requires the CSRF header", async () => {
  expect((await fetch("/api/v1/ad_connections/meta", { method: "DELETE" })).status).toBe(403)
})

it("the expired invitation token preview is 410", async () => {
  expect((await fetch("/api/v1/invitations/expired/preview")).status).toBe(410)
})

it("connecting an ad platform is idempotent and listed", async () => {
  const first = await json("/api/v1/ad_connections", "POST", { platform: "meta" })
  expect(first.status).toBe(201)
  const again = await json("/api/v1/ad_connections", "POST", { platform: "meta" })
  expect(again.status).toBe(200)
  const list = await (await fetch("/api/v1/ad_connections")).json()
  expect(list.connections).toHaveLength(1)
})

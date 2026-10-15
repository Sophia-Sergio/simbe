import type { CoordinatorDetail, CoordinatorRow } from "@/api/types"
import { asRole } from "@/test/mockApi"

it("the owner lists three coordinators", async () => {
  const body = (await (await fetch("/api/v1/coordinators")).json()) as CoordinatorRow[]
  expect(body.map((row) => row.name)).toEqual(["Dana Ortiz", "Jess Kim", "Priya Shah"])
})

it("Dana's detail carries KPIs and needs_action items", async () => {
  const body = (await (await fetch("/api/v1/coordinators/Dana%20Ortiz")).json()) as CoordinatorDetail
  expect(body.name).toBe("Dana Ortiz")
  expect(body.kpis.leads).toBe(4)
  expect(body.needs_action).toHaveLength(3)
})

it("an unknown coordinator is 404", async () => {
  expect((await fetch("/api/v1/coordinators/Nobody")).status).toBe(404)
})

it("a coordinator gets 403 on the owner-only route", async () => {
  asRole("coordinator")
  expect((await fetch("/api/v1/coordinators")).status).toBe(403)
})

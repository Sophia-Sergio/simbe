import { HttpResponse, http } from "msw"
import detailDana from "@contracts/examples/coordinators/detail-dana.json"
import listFixture from "@contracts/examples/coordinators/list.json"
import { db } from "../db"
import type { CoordinatorDetail, CoordinatorRow } from "@/api/types"
import { forbidden, isOwner, notFound, unauth } from "./shared"

function detailFor(name: string): CoordinatorDetail | null {
  if (name === "Dana Ortiz") return detailDana as CoordinatorDetail
  const row = (listFixture as CoordinatorRow[]).find((coordinator) => coordinator.name === name)
  if (!row) return null
  return {
    ...row,
    kpis: {
      leads: row.leads,
      qualified: row.qualified,
      qualified_rate: row.qualified_rate,
      first_reply_minutes: row.first_reply_minutes,
    },
    needs_action: [],
  }
}

export const coordinatorsHandlers = [
  http.get("/api/v1/coordinators", () => {
    if (!db.session) return unauth()
    if (!isOwner()) return forbidden()
    return HttpResponse.json(listFixture)
  }),
  http.get("/api/v1/coordinators/:name", ({ params }) => {
    if (!db.session) return unauth()
    if (!isOwner()) return forbidden()
    const detail = detailFor(String(params.name))
    return detail ? HttpResponse.json(detail) : notFound()
  }),
]

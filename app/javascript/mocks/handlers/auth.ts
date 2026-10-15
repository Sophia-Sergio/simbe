import { HttpResponse, http } from "msw"
import meCoordinator from "@contracts/examples/auth/me-coordinator.json"
import meOwner from "@contracts/examples/auth/me-owner.json"
import { COORDINATOR_EMAIL, OWNER_EMAIL, db, persistSession } from "../db"
import { csrfForbidden, jsonError } from "./shared"
import type { Me } from "@/api/types"

function meFor(email: string): Me {
  return (email === COORDINATOR_EMAIL ? meCoordinator : meOwner) as Me
}

// Sign in as erin (owner) or dana (coordinator); any non-empty password works, anyone else is 401.
export const authHandlers = [
  http.post("/api/v1/session", async ({ request }) => {
    const csrf = csrfForbidden(request)
    if (csrf) return csrf
    const body = (await request.json().catch(() => ({}))) as { email?: string; password?: string }
    const email = body.email ?? ""
    const known = email === OWNER_EMAIL || email === COORDINATOR_EMAIL
    if (!known || !body.password) return jsonError(401, "invalid_credentials", "Email or password is incorrect")
    db.session = { email, role: email === COORDINATOR_EMAIL ? "coordinator" : "owner" }
    persistSession(db.session)
    return HttpResponse.json(meFor(email), { status: 201 })
  }),
  http.delete("/api/v1/session", ({ request }) => {
    const csrf = csrfForbidden(request)
    if (csrf) return csrf
    if (!db.session) return jsonError(401, "unauthenticated", "Sign in required")
    db.session = null
    persistSession(null)
    return new HttpResponse(null, { status: 204 })
  }),
  http.get("/api/v1/me", () => {
    if (!db.session) return jsonError(401, "unauthenticated", "Sign in required")
    return HttpResponse.json(meFor(db.session.email))
  }),
]

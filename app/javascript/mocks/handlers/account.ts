import { HttpResponse, http } from "msw"
import agencyFixture from "@contracts/examples/account/agency.json"
import meOwner from "@contracts/examples/auth/me-owner.json"
import { COORDINATOR_NAMES, db, persistSession } from "../db"
import { csrfForbidden, forbidden, isOwner, jsonError, notFound, unauth, uuid } from "./shared"
import type { AdConnection, AdPlatform, Agency, Invitation, Me } from "@/api/types"

const MILESTONES = ["application_submitted", "consult_attended", "records", "accepted"]

type SignupBody = {
  user?: { name?: string; email?: string; password?: string }
  agency?: { name?: string; timezone?: string; qualified_milestone?: string }
}
type AgencyUpdate = { name?: string; timezone?: string; qualified_milestone?: string }
type InviteBody = { email?: string; coordinator_name?: string }
type AcceptBody = { name?: string; password?: string }

function ownerGate(): Response | null {
  if (!db.session) return unauth()
  if (!isOwner()) return forbidden()
  return null
}

export const accountHandlers = [
  http.post("/api/v1/signup", async ({ request }) => {
    const csrf = csrfForbidden(request)
    if (csrf) return csrf
    const body = (await request.json().catch(() => ({}))) as SignupBody
    const email = body.user?.email ?? ""
    const password = body.user?.password ?? ""
    if (email === "taken@x.test") return jsonError(422, "email_taken", "That email already has an account")
    if (password.length < 10) return jsonError(422, "weak_password", "Password must be at least 10 characters")
    const base = agencyFixture as Agency
    const agency: Agency = {
      ...base,
      name: body.agency?.name ?? base.name,
      timezone: body.agency?.timezone ?? base.timezone,
      qualified_milestone: (body.agency?.qualified_milestone as Agency["qualified_milestone"]) ?? base.qualified_milestone,
    }
    db.agency = agency
    db.session = { email, role: "owner" }
    persistSession(db.session)
    const user = (meOwner as Me).user
    return HttpResponse.json({ user: { ...user, name: body.user?.name ?? user.name, email }, agency } satisfies Me, { status: 201 })
  }),

  // The contract declares only 200/401 here (no 403) — coordinators read the agency too.
  http.get("/api/v1/agency", () => {
    if (!db.session) return unauth()
    return HttpResponse.json(db.agency)
  }),
  http.patch("/api/v1/agency", async ({ request }) => {
    const csrf = csrfForbidden(request)
    if (csrf) return csrf
    if (!db.session) return unauth()
    if (!isOwner()) return forbidden()
    const body = (await request.json().catch(() => ({}))) as AgencyUpdate
    if (body.qualified_milestone && !MILESTONES.includes(body.qualified_milestone)) {
      return jsonError(422, "invalid_agency", "Unknown qualified milestone")
    }
    db.agency = { ...db.agency, ...body } as Agency
    return HttpResponse.json(db.agency)
  }),

  http.get("/api/v1/team", () => {
    if (!db.session) return unauth()
    if (!isOwner()) return forbidden()
    return HttpResponse.json(db.team)
  }),

  // Invite a coordinator by name (no email provider yet — the response carries accept_url).
  http.post("/api/v1/invitations", async ({ request }) => {
    const csrf = csrfForbidden(request)
    if (csrf) return csrf
    if (!db.session) return unauth()
    if (!isOwner()) return forbidden()
    const body = (await request.json().catch(() => ({}))) as InviteBody
    if (!body.coordinator_name || !COORDINATOR_NAMES.includes(body.coordinator_name)) {
      return jsonError(422, "unknown_coordinator", "Pick an existing coordinator", { valid_names: COORDINATOR_NAMES })
    }
    if (!body.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email)) {
      return jsonError(422, "invalid_email", "A valid email is required")
    }
    const token = uuid().replace(/-/g, "").slice(0, 16)
    const invitation: Invitation = {
      id: uuid(),
      email: body.email,
      role: "coordinator",
      coordinator_name: body.coordinator_name,
      status: "pending",
      expires_at: "2026-10-08T12:00:00.000Z",
      accept_url: `http://localhost:5173/invite/${token}`,
    }
    db.team = { ...db.team, invitations: [...db.team.invitations, { ...invitation }] }
    return HttpResponse.json(invitation, { status: 201 })
  }),

  http.delete("/api/v1/invitations/:id", ({ request, params }) => {
    const csrf = csrfForbidden(request)
    if (csrf) return csrf
    if (!db.session) return unauth()
    if (!isOwner()) return forbidden()
    const id = String(params.id)
    const next = db.team.invitations.filter((invitation) => invitation.id !== id)
    if (next.length === db.team.invitations.length) return notFound()
    db.team = { ...db.team, invitations: next }
    return new HttpResponse(null, { status: 204 })
  }),

  // Public: who invited me (token from accept_url). `expired` is the canned dead token.
  http.get("/api/v1/invitations/:token/preview", ({ params }) => {
    if (String(params.token) === "expired") return jsonError(410, "invitation_expired", "This invitation has expired")
    const pending = db.team.invitations.find((invitation) => invitation.status === "pending")
    return HttpResponse.json({
      agency_name: db.agency.name,
      email: pending?.email ?? "maya@harbor.test",
      coordinator_name: pending?.coordinator_name ?? "Jess Kim",
    })
  }),
  http.post("/api/v1/invitations/:token/accept", async ({ request, params }) => {
    const csrf = csrfForbidden(request)
    if (csrf) return csrf
    if (String(params.token) === "expired") return jsonError(410, "invitation_expired", "This invitation has expired")
    const body = (await request.json().catch(() => ({}))) as AcceptBody
    if ((body.password ?? "").length < 10) return jsonError(422, "weak_password", "Password must be at least 10 characters")
    db.session = { email: "dana@harbor.test", role: "coordinator" }
    persistSession(db.session)
    return HttpResponse.json(
      {
        user: { id: "33333333-3333-4333-8333-333333333333", name: body.name ?? "Dana Ortiz", email: "dana@harbor.test", role: "coordinator", coordinator_name: "Dana Ortiz" },
        agency: db.agency,
      } satisfies Me,
      { status: 201 },
    )
  }),

  http.get("/api/v1/coordinator_names", () => {
    if (!db.session) return unauth()
    if (!isOwner()) return forbidden()
    return HttpResponse.json({ names: COORDINATOR_NAMES })
  }),

  http.get("/api/v1/ad_connections", () => {
    const gate = ownerGate()
    if (gate) return gate
    return HttpResponse.json({ connections: db.connections })
  }),
  http.post("/api/v1/ad_connections", async ({ request }) => {
    const csrf = csrfForbidden(request)
    if (csrf) return csrf
    if (!db.session) return unauth()
    if (!isOwner()) return forbidden()
    const body = (await request.json().catch(() => ({}))) as { platform?: string }
    const platform = body.platform
    if (platform !== "meta" && platform !== "google") return jsonError(422, "invalid_platform", "Unknown platform")
    const existing = db.connections.find((connection) => connection.platform === platform)
    if (existing) return HttpResponse.json(existing)
    const connection: AdConnection = { platform: platform as AdPlatform, status: "connected", connected_at: "2026-10-01T12:00:00.000Z" }
    db.connections = [...db.connections, connection]
    return HttpResponse.json(connection, { status: 201 })
  }),
  http.delete("/api/v1/ad_connections/:platform", ({ request, params }) => {
    const csrf = csrfForbidden(request)
    if (csrf) return csrf
    if (!db.session) return unauth()
    if (!isOwner()) return forbidden()
    const platform = String(params.platform)
    db.connections = db.connections.filter((connection) => connection.platform !== platform)
    return new HttpResponse(null, { status: 204 })
  }),
]

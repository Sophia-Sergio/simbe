// Small helpers shared by every mock handler: the error envelope, the CSRF/role guards and ids.
import { HttpResponse } from "msw"
import { db } from "../db"
import { scenario } from "../scenarios"

/** Error envelope: `{ error: { code, message }, ...extra }`. */
export function jsonError(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
  return HttpResponse.json({ error: { code, message }, ...extra }, { status })
}

/** Every non-GET request must send `X-Requested-With: simbe`; returns a 403 Response when it does not. */
export function csrfForbidden(request: Request): Response | null {
  if (request.method === "GET" || request.method === "HEAD") return null
  return request.headers.get("X-Requested-With") === "simbe"
    ? null
    : jsonError(403, "forbidden", "Missing X-Requested-With header")
}

export const unauth = () => jsonError(401, "unauthenticated", "Sign in required")
export const forbidden = () => jsonError(403, "forbidden", "Owner access required")
export const notFound = () => jsonError(404, "not_found", "Not found")

export const COORDINATOR_NAME = "Dana Ortiz"

export const isOwner = () => db.session?.role === "owner"
export const isCoordinator = () => db.session?.role === "coordinator"
/** The session's coordinator name, or null for an owner / signed-out session. */
export const coordinatorName = (): string | null => (db.session?.role === "coordinator" ? COORDINATOR_NAME : null)

export const uuid = () => crypto.randomUUID()

let mockDelayMs = 1500
/** Test/dev hook for the `slow` scenario delay (tests inject a controlled value). */
export function setMockDelay(ms: number): void {
  mockDelayMs = ms
}

/** Awaits the injected delay only in the `slow` scenario; every handler goes through it. */
export function scenarioDelay(): Promise<void> {
  return scenario === "slow" ? new Promise((resolve) => setTimeout(resolve, mockDelayMs)) : Promise.resolve()
}

/** In the `error` scenario every GET data endpoint fails; `/me` still answers so the shell can render. */
export function scenarioError(request: Request): Response | null {
  if (scenario !== "error" || request.method !== "GET") return null
  return new URL(request.url).pathname === "/api/v1/me" ? null : jsonError(500, "server_error", "Something went wrong. Try again.")
}

/** True once the agency has a loaded snapshot: emptiness follows the data, not the scenario flag. */
export const hasData = () => db.snapshot.snapshot !== null

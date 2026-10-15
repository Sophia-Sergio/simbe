// Test helpers for the MSW mock API: `mockApi` layers per-test overrides over the default handlers,
// `setViewport` stubs matchMedia/innerWidth for responsive tests, and `asRole` flips the mock session.
import { HttpResponse, http } from "msw"
import { COORDINATOR_EMAIL, OWNER_EMAIL, setSession } from "@/mocks/db"
import { server } from "@/mocks/server"

export type MockOverride = unknown | ((req: Request) => Response | Promise<Response>)

function parseKey(key: string): { method: string; pathname: string; query: URLSearchParams } {
  const [head, ...rest] = key.trim().split("?")
  const query = new URLSearchParams(rest.join("?"))
  const parts = head.split(/\s+/)
  const method = parts.length > 1 ? parts[0].toUpperCase() : "GET"
  const pathname = parts.length > 1 ? parts.slice(1).join(" ") : parts[0]
  return { method, pathname, query }
}

/**
 * Overrides default handlers for one test. Keys are `"GET /api/v1/x?range=30d"`, `"POST /api/v1/x"` or a
 * bare path (GET). Matching is exact on method + pathname; when the key carries a query string every key
 * param must equal the request's param (other params are ignored). An object value is returned as JSON; a
 * function is called with the request and may return any Response.
 */
export function mockApi(overrides: Record<string, MockOverride>): void {
  const handlers = Object.entries(overrides).map(([key, value]) => {
    const { method, pathname, query } = parseKey(key)
    const resolver = ({ request }: { request: Request }): Response | undefined | Promise<Response | undefined> => {
      const url = new URL(request.url)
      for (const [k, v] of query) {
        if (url.searchParams.get(k) !== v) return undefined
      }
      if (typeof value === "function") return (value as (req: Request) => Response | Promise<Response>)(request)
      return HttpResponse.json(value as Parameters<typeof HttpResponse.json>[0])
    }
    const m = method.toLowerCase()
    if (m === "get") return http.get(pathname, resolver)
    if (m === "post") return http.post(pathname, resolver)
    if (m === "patch") return http.patch(pathname, resolver)
    if (m === "put") return http.put(pathname, resolver)
    if (m === "delete") return http.delete(pathname, resolver)
    throw new Error(`mockApi: unsupported method in "${key}"`)
  })
  server.use(...handlers)
}

/** Stubs the viewport at `width` and fires `resize` (matches the 860px breakpoint). */
export function setViewport(width: number): void {
  window.matchMedia = ((query: string) => ({
    matches: /min-width:\s*860px/.test(query) ? width >= 860 : false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => true,
  })) as unknown as typeof window.matchMedia
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: width })
  window.dispatchEvent(new Event("resize"))
}

/** Signs the mock in as the owner, the coordinator, or out (`null`) for the signed-out screens. */
export function asRole(role: "owner" | "coordinator" | null): void {
  setSession(role === null ? null : { email: role === "owner" ? OWNER_EMAIL : COORDINATOR_EMAIL, role })
}

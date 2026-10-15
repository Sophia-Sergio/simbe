import { HttpResponse, http } from "msw"
import { db } from "../db"
import { csrfForbidden, forbidden, isOwner, jsonError, unauth } from "./shared"

const KEY_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Single-flight guard so a double-click cannot rotate twice (F-CONNECT relies on the 409).
let rotating = false

function randomKey(): string {
  let suffix = ""
  for (let i = 0; i < 24; i += 1) suffix += KEY_CHARS[Math.floor(Math.random() * KEY_CHARS.length)]
  return `simbe_live_${suffix}`
}

const url = () => `https://mcp.simbe.app/${db.agency.slug}`

export const mcpHandlers = [
  http.get("/api/v1/mcp", () => {
    if (!db.session) return unauth()
    if (!isOwner()) return forbidden()
    return HttpResponse.json({
      url: url(),
      key_prefix: db.mcp.key_prefix,
      ...(db.mcp.created_at ? { created_at: db.mcp.created_at } : {}),
    })
  }),

  // Rotate returns the full key once; only the prefix is remembered. Single-flight (409 while one is running).
  http.post("/api/v1/mcp/rotate", async ({ request }) => {
    const csrf = csrfForbidden(request)
    if (csrf) return csrf
    if (!db.session) return unauth()
    if (!isOwner()) return forbidden()
    if (rotating) return jsonError(409, "already_in_progress", "A key rotation is already running")
    rotating = true
    try {
      await delay(25)
      const key = randomKey()
      const key_prefix = key.slice(0, 18)
      db.mcp = { key_prefix, created_at: new Date().toISOString() }
      return HttpResponse.json({ key, url: url(), key_prefix }, { status: 201 })
    } finally {
      rotating = false
    }
  }),
]

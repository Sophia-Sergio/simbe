import { HttpResponse, http } from "msw"
import { db } from "../db"
import { csrfForbidden, forbidden, isOwner, unauth } from "./shared"

const KEY_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

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

  // Rotate returns the full key once; only the prefix is remembered.
  http.post("/api/v1/mcp/rotate", ({ request }) => {
    const csrf = csrfForbidden(request)
    if (csrf) return csrf
    if (!db.session) return unauth()
    if (!isOwner()) return forbidden()
    const key = randomKey()
    const key_prefix = key.slice(0, 18)
    db.mcp = { key_prefix, created_at: new Date().toISOString() }
    return HttpResponse.json({ key, url: url(), key_prefix }, { status: 201 })
  }),
]

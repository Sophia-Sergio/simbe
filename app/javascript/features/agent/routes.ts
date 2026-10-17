// In-app destinations the agent may link to (spec decision 2's route whitelist). Anything else is
// dropped rather than navigated to, so a model or prompt-injected answer can never send the user
// off-app (`//evil.example`, `https://…`, `javascript:…`) or to an unowned path.
const APP_PREFIXES = ["/funnel", "/channels", "/pipeline", "/coordinators", "/data", "/settings", "/next-actions"]

/**
 * A model-supplied route, or `null` when it must be dropped. Only same-app destinations pass: a
 * single leading slash, no scheme, no backslashes, `//`, `..` or control characters, and a known
 * app prefix. A query/hash is allowed and preserved (`/pipeline?lead=1`).
 *
 * Pure and dependency-free so it can be unit-tested and shared by `toTurn` and the bubble.
 */
export function safeRoute(route: unknown): string | null {
  if (typeof route !== "string" || route === "") return null
  // Protocol-relative ("//host") and absolute/`scheme:` URLs never start with a single "/".
  if (!route.startsWith("/") || route.startsWith("//")) return null
  if (route.includes("\\") || route.includes("//") || route.includes("..")) return null
  for (const char of route) {
    const code = char.charCodeAt(0)
    if (code < 0x20 || code === 0x7f) return null
  }
  const [path] = route.split(/[?#]/)
  if (path === "/") return "/"
  return APP_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`)) ? route : null
}

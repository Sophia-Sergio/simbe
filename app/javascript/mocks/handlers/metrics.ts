import { HttpResponse, http } from "msw"
import channelFacebook from "@contracts/examples/metrics/channel-facebook.json"
import channels from "@contracts/examples/metrics/channels.json"
import funnel from "@contracts/examples/metrics/funnel.json"
import recommendations from "@contracts/examples/metrics/recommendations.json"
import summary from "@contracts/examples/metrics/summary.json"
import summaryEmpty from "@contracts/examples/metrics/summary-empty.json"
import { db } from "../db"
import { scenario } from "../scenarios"
import { forbidden, isOwner, jsonError, notFound, unauth } from "./shared"

const RANGES = ["30d", "90d", "12m"]
const KNOWN_CHANNELS = ["Facebook", "Instagram", "Google", "Referral", "TikTok", "Unknown"]

const isEmpty = () => scenario === "empty" || scenario === "new"

function gate(): Response | null {
  if (!db.session) return unauth()
  if (!isOwner()) return forbidden()
  return null
}

/** 422 bad_range when `?range=` is missing from the enum. */
function rangeGuard(request: Request): Response | null {
  const range = new URL(request.url).searchParams.get("range") ?? "30d"
  return RANGES.includes(range) ? null : jsonError(422, "bad_range", "range must be 30d, 90d or 12m")
}

export const metricsHandlers = [
  http.get("/api/v1/metrics/summary", ({ request }) => {
    const gated = gate()
    if (gated) return gated
    const bad = rangeGuard(request)
    if (bad) return bad
    const range = new URL(request.url).searchParams.get("range") ?? "30d"
    return HttpResponse.json({ ...(isEmpty() ? summaryEmpty : summary), range })
  }),
  http.get("/api/v1/metrics/funnel", ({ request }) => {
    const gated = gate()
    if (gated) return gated
    const bad = rangeGuard(request)
    if (bad) return bad
    return HttpResponse.json(funnel)
  }),
  http.get("/api/v1/metrics/channels", ({ request }) => {
    const gated = gate()
    if (gated) return gated
    const bad = rangeGuard(request)
    if (bad) return bad
    return HttpResponse.json(channels)
  }),
  http.get("/api/v1/metrics/channels/:channel", ({ request, params }) => {
    const gated = gate()
    if (gated) return gated
    const bad = rangeGuard(request)
    if (bad) return bad
    const channel = String(params.channel)
    if (channel === "Facebook") return HttpResponse.json(channelFacebook)
    if (KNOWN_CHANNELS.includes(channel)) {
      return HttpResponse.json({
        channel,
        kpis: { leads: 0, qualified: 0, rate: 0, spend_cents: null, cost_per_qualified_cents: null },
        campaigns: [],
      })
    }
    return notFound()
  }),
  http.get("/api/v1/recommendations", ({ request }) => {
    const gated = gate()
    if (gated) return gated
    const bad = rangeGuard(request)
    if (bad) return bad
    return HttpResponse.json(isEmpty() ? [] : recommendations)
  }),
]

import { HttpResponse, http } from "msw"
import fixture from "@contracts/examples/next-actions/next-actions.json"
import { db } from "../db"
import { scenario } from "../scenarios"
import type { NextActions } from "@/api/types"
import { coordinatorName, csrfForbidden, jsonError, notFound, unauth } from "./shared"

const QUEUES = ["text_back_now", "nudge_applications", "rebook_consults", "paused_due_back"]
const LEAD_COORDINATOR: Record<string, string> = {
  "aaaaaaaa-0000-4000-8000-000000000007": "Priya Shah",
  "aaaaaaaa-0000-4000-8000-000000000004": "Dana Ortiz",
  "aaaaaaaa-0000-4000-8000-000000000003": "Dana Ortiz",
  "aaaaaaaa-0000-4000-8000-000000000010": "Dana Ortiz",
}

function comboExists(leadId: string, queue: string): boolean {
  return (fixture.queues as NextActions["queues"]).some((q) => q.key === queue && q.items.some((item) => item.lead_id === leadId))
}

function build(coordinator: string | null): NextActions {
  const empty = scenario === "empty" || scenario === "new"
  const queues = (structuredClone(fixture.queues) as NextActions["queues"]).map((queue) => {
    const items = empty
      ? []
      : queue.items
          .filter((item) => !coordinator || LEAD_COORDINATOR[item.lead_id] === coordinator)
          .map((item) => ({ ...item, done: db.completions.has(`${item.lead_id}:${queue.key}`) }))
    return { ...queue, count: items.filter((item) => !item.done).length, items }
  })
  const all = queues.flatMap((queue) => queue.items)
  return { as_of: fixture.as_of, progress: { done: all.filter((item) => item.done).length, total: all.length }, queues }
}

// Undo is not idempotent-violating: setting done twice returns true twice and unsetting twice returns false twice.
function completion(request: Request, params: Record<string, string | readonly string[] | undefined>, done: boolean) {
  const csrf = csrfForbidden(request)
  if (csrf) return csrf
  if (!db.session) return unauth()
  const leadId = String(params.lead_id)
  const queue = String(params.queue)
  if (!QUEUES.includes(queue)) return jsonError(422, "bad_queue", "Unknown queue")
  const coord = coordinatorName()
  if (!comboExists(leadId, queue) || (coord && LEAD_COORDINATOR[leadId] !== coord)) return notFound()
  const key = `${leadId}:${queue}`
  if (done) db.completions.add(key)
  else db.completions.delete(key)
  return HttpResponse.json({ done })
}

export const nextActionsHandlers = [
  http.get("/api/v1/next_actions", ({ request }) => {
    if (!db.session) return unauth()
    const coord = coordinatorName() ?? new URL(request.url).searchParams.get("coordinator")
    return HttpResponse.json(build(coord))
  }),
  http.post("/api/v1/next_actions/:lead_id/:queue/completion", ({ request, params }) =>
    completion(request, params as Record<string, string>, true),
  ),
  http.delete("/api/v1/next_actions/:lead_id/:queue/completion", ({ request, params }) =>
    completion(request, params as Record<string, string>, false),
  ),
]

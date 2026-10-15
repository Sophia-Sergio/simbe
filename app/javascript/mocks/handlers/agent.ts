import { HttpResponse, http } from "msw"
import answerFixture from "@contracts/examples/agent/answer.json"
import { db } from "../db"
import { scenario } from "../scenarios"
import type { AgentBody, AgentMessage } from "@/api/types"
import { csrfForbidden, forbidden, isOwner, jsonError, notFound, unauth, uuid } from "./shared"

const NOW = "2026-10-01T12:00:00.000Z"
const OWNER_SUGGESTIONS = [
  "Which channel costs the most per qualified lead?",
  "Where do most applicants drop off?",
  "How should I split next month's budget?",
  "Who needs support on my team?",
]
const COORDINATOR_SUGGESTIONS = [
  "Who should I text back first?",
  "Which leads are overdue?",
  "Where am I losing applicants?",
]

// The model takes a few seconds; a small delay also makes the in-flight guard observable in tests.
let inFlight = false
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function buildAnswer(text: string): AgentBody {
  if (/google/i.test(text)) {
    return { text: `You asked: "${text}" Google has spent $450 with no qualified leads yet — too small a sample to act on.` }
  }
  return (answerFixture.message.body as AgentBody)
}

export const agentHandlers = [
  http.post("/api/v1/agent/messages", async ({ request }) => {
    const csrf = csrfForbidden(request)
    if (csrf) return csrf
    if (!db.session) return unauth()
    if (inFlight) return jsonError(409, "already_in_progress", "An answer is already in progress")
    const body = (await request.json().catch(() => ({}))) as { conversation_id?: string; text?: string }
    const raw = body.text ?? ""
    if (!raw.trim()) return jsonError(422, "empty_text", "Ask a question")
    if (raw.length > 500) return jsonError(422, "text_too_long", "Keep it under 500 characters")
    if (scenario === "error") return jsonError(502, "model_unavailable", "I couldn't reach the model. Try again.")
    inFlight = true
    try {
      await delay(scenario === "slow" ? 1500 : 25)
      const conversationId = body.conversation_id ?? uuid()
      const message: AgentMessage = { id: uuid(), role: "assistant", created_at: NOW, body: buildAnswer(raw) }
      const user: AgentMessage = { id: uuid(), role: "user", created_at: NOW, body: { text: raw } }
      const existing = db.conversations.get(conversationId) ?? []
      db.conversations.set(conversationId, [...existing, user, message])
      return HttpResponse.json({ conversation_id: conversationId, message }, { status: 201 })
    } finally {
      inFlight = false
    }
  }),

  http.get("/api/v1/agent/conversations/:id", ({ params }) => {
    if (!db.session) return unauth()
    const id = String(params.id)
    const messages = db.conversations.get(id)
    return messages ? HttpResponse.json({ id, messages }) : notFound()
  }),

  http.get("/api/v1/agent/suggestions", () => {
    if (!db.session) return unauth()
    return HttpResponse.json({ suggestions: db.session.role === "coordinator" ? COORDINATOR_SUGGESTIONS : OWNER_SUGGESTIONS })
  }),

  http.get("/api/v1/agent/usage", () => {
    if (!db.session) return unauth()
    if (!isOwner()) return forbidden()
    return HttpResponse.json({ month: "2026-10", input_tokens: 42000, output_tokens: 6100, cost_cents: null })
  }),
]

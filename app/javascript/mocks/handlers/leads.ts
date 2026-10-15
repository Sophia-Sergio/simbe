import { HttpResponse, http } from "msw"
import boardFixture from "@contracts/examples/leads/board.json"
import detailCoordinator from "@contracts/examples/leads/detail-coordinator.json"
import detailOwner from "@contracts/examples/leads/detail-owner.json"
import listFixture from "@contracts/examples/leads/list.json"
import { db } from "../db"
import { scenario } from "../scenarios"
import type { Board, LeadCard, LeadDetail, LeadList } from "@/api/types"
import { coordinatorName, notFound, unauth } from "./shared"

const OPEN_KEYS = ["text_back_now", "nudge", "rebook", "due_back", "on_track"]
const PAUSED_KEYS = ["paused"]
const CLOSED_KEYS = ["not_eligible", "withdrew", "unresponsive"]
const ACCEPTED_KEYS = ["accepted"]

// Cards that only appear for status=all/closed/paused (the fixture list is the "open" set).
const EXTRA_LEADS: LeadCard[] = [
  {
    id: "aaaaaaaa-0000-4000-8000-000000000005",
    name: "L5 Alpha",
    channel: "TikTok",
    status: { key: "paused", label: "Paused", tone: "neutral" },
    state: "CA",
    age: 26,
    date: "2026-09-15T10:00:00.000Z",
    coordinator: "Jess Kim",
    stage: "consult",
    segments: ["done", "done", "done", "action", "todo", "todo"],
  },
  {
    id: "aaaaaaaa-0000-4000-8000-000000000006",
    name: "L6 Alpha",
    channel: "Unknown",
    status: { key: "not_eligible", label: "Not eligible", tone: "danger" },
    state: "TX",
    age: 24,
    date: "2026-09-10T10:00:00.000Z",
    coordinator: "Priya Shah",
    stage: "pre_screen",
    segments: ["done", "action", "todo", "todo", "todo", "todo"],
  },
]

const OPEN_LEADS = listFixture.leads as LeadCard[]
const ALL_LEADS = [...OPEN_LEADS, ...EXTRA_LEADS]

function byStatus(status: string): LeadCard[] {
  switch (status) {
    case "all":
      return ALL_LEADS
    case "closed":
      return ALL_LEADS.filter((lead) => CLOSED_KEYS.includes(lead.status.key))
    case "paused":
      return ALL_LEADS.filter((lead) => PAUSED_KEYS.includes(lead.status.key))
    case "accepted":
      return ALL_LEADS.filter((lead) => ACCEPTED_KEYS.includes(lead.status.key))
    default:
      return ALL_LEADS.filter((lead) => OPEN_KEYS.includes(lead.status.key))
  }
}

function boardFor(coordinator: string | null): Board {
  const source = structuredClone(boardFixture) as Board
  if (!coordinator) return source
  const columns = {} as Board["columns"]
  for (const key of Object.keys(source.columns) as (keyof Board["columns"])[]) {
    const leads = source.columns[key].leads.filter((lead) => lead.coordinator === coordinator)
    columns[key] = { count: leads.length, leads }
  }
  return { columns }
}

// Known lead ids that do not have a full fixture get a detail synthesized from their card.
function synthesize(card: LeadCard, canContact: boolean): LeadDetail {
  return {
    id: card.id,
    name: card.name,
    coordinator: card.coordinator,
    stage: card.stage,
    status: card.status,
    contact: {
      state: card.state,
      email: `lead-${card.id.slice(-4)}@example.com`,
      phone: canContact ? "555-0100-0000" : "•••-••••-0000",
      age: card.age,
      channel: card.channel,
      campaign: null,
      can_contact: canContact,
    },
    consult: { status: null, scheduled_for: null },
    screener: { counts: { met: 0, review: 0, not_met: 0, unanswered: 0, total: 0 }, items: [] },
    process: [
      { key: "screener", label: "Screener", state: "upcoming", detail: null },
      { key: "application", label: "Application", state: "upcoming", detail: null },
      { key: "consult", label: "Consult", state: "upcoming", detail: null },
      { key: "records", label: "Medical records", state: "upcoming", detail: null },
      { key: "accepted", label: "Accepted", state: "upcoming", detail: null },
    ],
    activity: [],
    source: { channel: card.channel, campaign: null, ad: null, first_visit: null, pages_viewed: 0, self_reported: null },
    summary: { text: `${card.name} is in ${card.stage}.`, next_step: "Review this record." },
    queue: null,
    done: false,
  }
}

export const leadsHandlers = [
  // List + search. Coordinators always see only their own leads; `q` is a literal, case-insensitive contains.
  http.get("/api/v1/leads", ({ request }) => {
    if (!db.session) return unauth()
    const url = new URL(request.url)
    const status = url.searchParams.get("status") ?? "open"
    const q = url.searchParams.get("q")
    const coordinatorParam = url.searchParams.get("coordinator")
    let leads = byStatus(status)
    const coord = coordinatorName()
    if (coord) leads = leads.filter((lead) => lead.coordinator === coord)
    else if (coordinatorParam) leads = leads.filter((lead) => lead.coordinator === coordinatorParam)
    if (q !== null) {
      const needle = q.toLowerCase()
      leads = leads.filter((lead) => lead.name.toLowerCase().includes(needle)).slice(0, 8)
      return HttpResponse.json({ leads, next_cursor: null } satisfies LeadList)
    }
    const per = Number(url.searchParams.get("per") ?? 50)
    const start = Number(url.searchParams.get("cursor") ?? 0)
    const page = leads.slice(start, start + per)
    const next = start + per < leads.length ? String(start + per) : null
    return HttpResponse.json({ leads: page, next_cursor: next } satisfies LeadList)
  }),

  // Declared before /leads/:id so "board" is not read as an id.
  http.get("/api/v1/leads/board", ({ request }) => {
    if (!db.session) return unauth()
    const coord = coordinatorName() ?? new URL(request.url).searchParams.get("coordinator")
    if (scenario === "empty" || scenario === "new") return HttpResponse.json(emptyBoard())
    return HttpResponse.json(boardFor(coord))
  }),

  http.get("/api/v1/leads/:id", ({ params }) => {
    if (!db.session) return unauth()
    const id = String(params.id)
    const card = ALL_LEADS.find((lead) => lead.id === id)
    if (!card) return notFound()
    const coord = coordinatorName()
    if (coord && card.coordinator !== coord) return notFound()
    if (id === "aaaaaaaa-0000-4000-8000-000000000004") {
      return HttpResponse.json(coord ? detailCoordinator : detailOwner)
    }
    return HttpResponse.json(synthesize(card, Boolean(coord)))
  }),
]

function emptyBoard(): Board {
  return { columns: { action_needed: { count: 0, leads: [] }, in_application: { count: 0, leads: [] }, consult: { count: 0, leads: [] }, qualified: { count: 0, leads: [] } } }
}

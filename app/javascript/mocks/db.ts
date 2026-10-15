// In-memory state for the MSW mock API. Everything a stateful UI flow needs to remember lives here:
// the signed-in session, done toggles, the team and pending invitations, ad connections, upload
// sessions, agent conversations, the agency (timezone / qualified milestone) and the current snapshot.
// Reset between tests (see test/setup.ts) or between scenario boots.
import agencyFixture from "@contracts/examples/account/agency.json"
import teamFixture from "@contracts/examples/account/team.json"
import currentFixture from "@contracts/examples/snapshots/current.json"
import currentLoadingFixture from "@contracts/examples/snapshots/current-loading.json"
import settingsFixture from "@contracts/examples/mcp/settings.json"
import type { AdConnection, Agency, AgentMessage, Report, Snapshot, SnapshotCurrent, Team } from "@/api/types"
import type { components } from "@/api/generated/schema"
import { scenario } from "./scenarios"

type Progress = components["schemas"]["Progress"]
type UploadStatus = components["schemas"]["UploadStatus"]

export const OWNER_EMAIL = "erin@harbor.test"
export const COORDINATOR_EMAIL = "dana@harbor.test"
/** The three coordinator names the mock accepts when inviting (mirrors AlphaScenario). */
export const COORDINATOR_NAMES = ["Dana Ortiz", "Jess Kim", "Priya Shah"]

const SESSION_KEY = "simbe_mock_session"

export type MockRole = "owner" | "coordinator"
export type MockSession = { email: string; role: MockRole }
/** A snapshot upload in flight: the files it was given, its report and its polling state machine. */
export type MockUpload = {
  files: string[]
  report: Report | null
  status: UploadStatus
  progress: Progress | null
  /** How many validation GETs have been served (drives validating → validated). */
  polls: number
  /** How many committing GETs have been served (drives committing → committed). */
  commitPolls: number
  /** How many commit requests this upload received (drives the slow scenario's already_in_progress). */
  commits: number
  snapshot: Snapshot | null
}

/** An agent conversation belongs to the user who started it. */
export type MockConversation = { owner: string; messages: AgentMessage[] }

function clone<T>(value: T): T {
  return structuredClone(value)
}

function loadSession(): MockSession | null {
  if (typeof localStorage === "undefined") return null
  const raw = localStorage.getItem(SESSION_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as MockSession
  } catch {
    return null
  }
}

/** Persists (or clears) the mock session so a page reload stays signed in — mock only, never the real app. */
export function persistSession(session: MockSession | null): void {
  if (typeof localStorage === "undefined") return
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  else localStorage.removeItem(SESSION_KEY)
}

function defaultSession(): MockSession | null {
  // Only the coordinator scenario preselects a session; every other scenario starts from the persisted
  // mock session, so signing out survives a reload (?mock=new/empty no longer force you back in).
  return scenario === "coordinator" ? { email: COORDINATOR_EMAIL, role: "coordinator" } : loadSession()
}

function seed() {
  const noData = scenario === "empty" || scenario === "new"
  const freshKey = scenario === "new"
  const snapshot: SnapshotCurrent =
    scenario === "loading"
      ? (clone(currentLoadingFixture) as SnapshotCurrent)
      : noData
        ? { snapshot: null, pending: null, files: [] }
        : (clone(currentFixture) as SnapshotCurrent)
  return {
    session: defaultSession(),
    completions: new Set<string>(),
    team: clone(teamFixture) as Team,
    connections: [] as AdConnection[],
    uploads: new Map<string, MockUpload>(),
    mcp: {
      key_prefix: freshKey ? null : (settingsFixture.key_prefix as string | null),
      created_at: freshKey ? undefined : (settingsFixture.created_at as string | undefined),
    },
    conversations: new Map<string, MockConversation>(),
    agency: clone(agencyFixture) as Agency,
    snapshot,
  }
}

export type Db = ReturnType<typeof seed> & { reset: () => void }

export const db: Db = {
  ...seed(),
  reset() {
    Object.assign(db, seed())
    persistSession(db.session)
  },
}

/** Sets the signed-in session (no persistence) — used by tests to switch roles. */
export function setSession(session: MockSession | null): void {
  db.session = session
}

export const apiPath = (p: string) => `/api/v1${p}`

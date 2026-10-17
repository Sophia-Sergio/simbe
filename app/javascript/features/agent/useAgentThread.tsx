import { createContext, useContext } from "react"
import type { ReactNode } from "react"

/** One bar of the agent's inline chart; `display` is the model's pre-formatted label. */
type AgentBar = { label: string; value: number; display: string }
type AgentChart = { title: string; bars: AgentBar[] }
/** A whitelisted in-app route with the label to show for it. */
type AgentLink = { label: string; route: string }

/** One turn in the thread, exactly as the panel renders it (never raw HTML). */
export type AgentTurn = {
  id: string
  role: "user" | "assistant"
  body: {
    text: string
    chart?: AgentChart
    action?: AgentLink
    sources?: AgentLink[]
    suggestions?: string[]
    /** A user turn whose send failed; retrying the same text reuses it in place. */
    failed?: boolean
  }
}

export type AgentThread = {
  messages: AgentTurn[]
  pending: boolean
  error: string | null
  /** Sends a question; resolves `true` when an answer arrived, so the composer knows to clear. */
  send: (text: string) => Promise<boolean>
}

const AgentThreadContext = createContext<AgentThread | null>(null)

/**
 * The conversation the panel renders. Kept separate from the Wave-0 `AgentContext` (which only
 * carries `isOpen`/`open`/`close` for the rest of the app): the panel needs the thread itself.
 *
 * This module deliberately imports nothing but React so `feature.ts` can load it (see
 * `app/javascript/app/registry.test.ts`: feature.ts is loaded through a Vite server with no `@` alias).
 */
export function AgentThreadProvider({ value, children }: { value: AgentThread; children: ReactNode }) {
  return <AgentThreadContext.Provider value={value}>{children}</AgentThreadContext.Provider>
}

/** The agent conversation; throws outside `<AgentProvider>`. */
export function useAgentThread(): AgentThread {
  const thread = useContext(AgentThreadContext)
  if (!thread) throw new Error("useAgentThread must be used within <AgentProvider>")
  return thread
}

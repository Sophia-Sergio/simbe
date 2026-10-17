import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"
import { useQueryClient } from "@tanstack/react-query"
// Relative imports on purpose: `feature.ts` loads this module eagerly and is resolved by
// `app/javascript/app/registry.test.ts` through a Vite server that has no `@` alias (see the comment
// in `features/next-actions/feature.ts`). The `@` alias is used everywhere else.
import { AgentContext } from "../../app/agent"
import { ApiError } from "../../api/client"
import { useSendAgentMessage } from "../../api/hooks/agent"
import { useAsyncAction } from "../../hooks/useAsyncAction"
import type { AgentMessage } from "../../api/types"
import { safeRoute } from "./routes"
import { AgentThreadProvider } from "./useAgentThread"
import type { AgentTurn } from "./useAgentThread"

// Ids for the optimistic user turns (`crypto.randomUUID` needs a secure context and is overkill here).
let localTurn = 0
const nextTurnId = () => `agent-turn-${(localTurn += 1)}`

/** Maps the API's stored assistant message onto the panel's turn shape, dropping anything unexpected. */
function toTurn(message: AgentMessage): AgentTurn {
  const { body } = message
  // Routes are sanitised here (the app's own paths only); an off-app action/source is dropped, so the
  // bubble renders the text without the button or the chip.
  const actionRoute = body.action ? safeRoute(body.action.route) : null
  const sources = (body.sources ?? [])
    .map((source) => ({ label: source.label, route: safeRoute(source.route) }))
    .filter((source): source is { label: string; route: string } => source.route !== null)
  return {
    id: message.id,
    role: "assistant",
    body: {
      text: body.text,
      chart: body.chart
        ? { title: body.chart.title, bars: body.chart.bars.map((bar) => ({ label: bar.label, value: bar.value, display: bar.display })) }
        : undefined,
      action: body.action && actionRoute ? { label: body.action.label, route: actionRoute } : undefined,
      sources: sources.length > 0 ? sources : undefined,
      suggestions: body.suggestions,
    },
  }
}

/** The user-facing copy for each documented failure (see the lane plan's override 4). */
function errorMessage(caught: unknown): string {
  if (caught instanceof ApiError) {
    if (caught.status === 409) return "Still working on your last question."
    if (caught.status === 502) return "I couldn't reach the model. Try again."
    if (caught.code === "text_too_long") return "Keep it under 500 characters."
  }
  return "Something went wrong. Try again."
}

/** `"<agency id>:<user id>"` from the auth cache, or `null` when signed out. */
type AuthIdentity = { user?: { id?: string }; agency?: { id?: string } }
function identityOf(me: AuthIdentity | undefined): string | null {
  return me?.user?.id && me?.agency?.id ? `${me.agency.id}:${me.user.id}` : null
}

/**
 * Supplies the real `useAgent()` to the Wave-0 `AgentContext` (this lane replaces the no-op) and
 * owns the one conversation: `open(question?)` opens the panel and, when given a question, sends it
 * once (the "Ask why" buttons on This week and the channel detail's "Ask Simbe").
 */
export function AgentProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<AgentTurn[]>([])
  const [error, setError] = useState<string | null>(null)
  const conversationId = useRef<string | undefined>(undefined)
  // Bumped on every reset so an in-flight reply from the previous session is discarded.
  const generation = useRef(0)
  const queryClient = useQueryClient()
  const sendMessage = useSendAgentMessage()
  const sendRef = useRef(sendMessage.mutateAsync)
  useEffect(() => {
    sendRef.current = sendMessage.mutateAsync
  })

  // A sign-out (or a different user/agency) must not leave the previous session's conversation in
  // memory: drop the thread, the conversation id and any open panel.
  const reset = useCallback(() => {
    generation.current += 1
    conversationId.current = undefined
    setMessages([])
    setError(null)
    setIsOpen(false)
  }, [])

  useEffect(() => {
    const identity = { current: identityOf(queryClient.getQueryData<AuthIdentity>(["me"])) }
    return queryClient.getQueryCache().subscribe((event) => {
      if ((event.query.queryKey as readonly unknown[])[0] !== "me") return
      const next = identityOf(queryClient.getQueryData<AuthIdentity>(["me"]))
      const previous = identity.current
      if (next === previous) return
      identity.current = next
      // Skip the initial null → signed-in transition (nothing to clear yet); reset on sign-out (→
      // null) and on any switch between two signed-in identities.
      if (previous !== null || next === null) reset()
    })
  }, [queryClient, reset])

  const { run: send, pending } = useAsyncAction<[string], boolean>(async (text) => {
    const question = text.trim()
    if (!question) return false
    const session = generation.current
    setError(null)
    setMessages((prev) => {
      // Retrying the question whose send just failed reuses that bubble (cleared of its marker)
      // instead of appending a twin user turn.
      const last = prev[prev.length - 1]
      if (last?.role === "user" && last.body.text === question) {
        return [...prev.slice(0, -1), { ...last, body: { ...last.body, failed: false } }]
      }
      return [...prev, { id: nextTurnId(), role: "user", body: { text: question } }]
    })
    try {
      const reply = await sendRef.current({ conversationId: conversationId.current, text: question })
      if (generation.current !== session) return false
      conversationId.current = reply.conversation_id
      setMessages((prev) => [...prev, toTurn(reply.message)])
      // Clears a "still answering" hint set while this turn was in flight.
      setError(null)
      return true
    } catch (caught) {
      if (generation.current !== session) return false
      setMessages((prev) => {
        const last = prev[prev.length - 1]
        if (last?.role === "user" && last.body.text === question) {
          return [...prev.slice(0, -1), { ...last, body: { ...last.body, failed: true } }]
        }
        return prev
      })
      setError(errorMessage(caught))
      return false
    }
  })

  const open = useCallback(
    (question?: string) => {
      setIsOpen(true)
      if (!question) return
      if (pending) {
        // Single-flight: say so instead of silently dropping a question asked mid-answer.
        setError("I'm still answering your last question — ask again in a moment.")
        return
      }
      void send(question)
    },
    [pending, send],
  )
  const close = useCallback(() => setIsOpen(false), [])

  const agent = useMemo(() => ({ isOpen, open, close }), [isOpen, open, close])
  const thread = useMemo(
    () => ({
      messages,
      pending,
      error,
      // `run` returns undefined when a re-entrant call is ignored; normalise it for the composer.
      send: async (text: string) => (await send(text)) ?? false,
    }),
    [messages, pending, error, send],
  )

  return (
    <AgentContext.Provider value={agent}>
      <AgentThreadProvider value={thread}>{children}</AgentThreadProvider>
    </AgentContext.Provider>
  )
}

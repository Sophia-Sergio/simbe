import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"
// Relative imports on purpose: `feature.ts` loads this module eagerly and is resolved by
// `app/javascript/app/registry.test.ts` through a Vite server that has no `@` alias (see the comment
// in `features/next-actions/feature.ts`). The `@` alias is used everywhere else.
import { AgentContext } from "../../app/agent"
import { ApiError } from "../../api/client"
import { useSendAgentMessage } from "../../api/hooks/agent"
import { useAsyncAction } from "../../hooks/useAsyncAction"
import type { AgentMessage } from "../../api/types"
import { AgentThreadProvider } from "./useAgentThread"
import type { AgentTurn } from "./useAgentThread"

// Ids for the optimistic user turns (`crypto.randomUUID` needs a secure context and is overkill here).
let localTurn = 0
const nextTurnId = () => `agent-turn-${(localTurn += 1)}`

/** Maps the API's stored assistant message onto the panel's turn shape, dropping anything unexpected. */
export function toTurn(message: AgentMessage): AgentTurn {
  const { body } = message
  return {
    id: message.id,
    role: "assistant",
    body: {
      text: body.text,
      chart: body.chart
        ? { title: body.chart.title, bars: body.chart.bars.map((bar) => ({ label: bar.label, value: bar.value, display: bar.display })) }
        : undefined,
      action: body.action ? { label: body.action.label, route: body.action.route } : undefined,
      sources: body.sources?.map((source) => ({ label: source.label, route: source.route })),
      suggestions: body.suggestions,
    },
  }
}

/** The user-facing copy for each documented failure (see the lane plan's override 4). */
export function errorMessage(caught: unknown): string {
  if (caught instanceof ApiError) {
    if (caught.status === 409) return "Still working on your last question."
    if (caught.status === 502) return "I couldn't reach the model. Try again."
    if (caught.code === "text_too_long") return "Keep it under 500 characters."
  }
  return "Something went wrong. Try again."
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
  const sendMessage = useSendAgentMessage()
  const sendRef = useRef(sendMessage.mutateAsync)
  useEffect(() => {
    sendRef.current = sendMessage.mutateAsync
  })

  const { run: send, pending } = useAsyncAction<[string], boolean>(async (text) => {
    const question = text.trim()
    if (!question) return false
    setError(null)
    setMessages((prev) => [...prev, { id: nextTurnId(), role: "user", body: { text: question } }])
    try {
      const reply = await sendRef.current({ conversationId: conversationId.current, text: question })
      conversationId.current = reply.conversation_id
      setMessages((prev) => [...prev, toTurn(reply.message)])
      return true
    } catch (caught) {
      setError(errorMessage(caught))
      return false
    }
  })

  const open = useCallback(
    (question?: string) => {
      setIsOpen(true)
      if (question) void send(question)
    },
    [send],
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

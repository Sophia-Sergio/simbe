import { Send, X } from "lucide-react"
import { useEffect, useId, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useAgentSuggestions } from "@/api/hooks/agent"
import { useAgent } from "@/app/agent"
import { useAuth } from "@/app/auth/useAuth"
import { BrandMark } from "@/components/ui/BrandMark"
import { useFocusTrap, useLockBody, useReturnFocus } from "@/components/ui/Modal"
import { useDismiss } from "@/hooks/useDismiss"
import { useIsDesktop } from "@/hooks/useIsDesktop"
import { MessageBubble } from "./MessageBubble"
import { SuggestionChips } from "./SuggestionChips"
import { useAgentThread } from "./useAgentThread"

/**
 * "Ask Simbe": a 400px floating panel bottom-right on desktop and a full-screen panel on mobile
 * (opened from the Ask tab). Own shell — the kit's `Sheet` is a different shape — but it reuses the
 * kit's focus trap / body lock / focus return, so Esc and outside-click close it.
 */
export function AgentPanel() {
  const { isOpen, close } = useAgent()
  const isDesktop = useIsDesktop()
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useDismiss({ ref, onDismiss: close, enabled: isOpen })
  useFocusTrap(ref, isOpen)
  useLockBody(isOpen)
  useReturnFocus(ref, isOpen)

  if (!isOpen || typeof document === "undefined") return null

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div data-testid="agent-scrim" aria-hidden className="absolute inset-0 bg-dark/30" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-variant={isDesktop ? "panel" : "full"}
        tabIndex={-1}
        className={
          isDesktop
            ? "absolute bottom-6 right-6 flex max-h-[min(640px,calc(100dvh-3rem))] w-[400px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-modal bg-surface shadow-modal"
            : "absolute inset-0 flex h-full w-full flex-col bg-surface pb-[env(safe-area-inset-bottom)]"
        }
      >
        <PanelBody titleId={titleId} onClose={close} />
      </div>
    </div>,
    document.body,
  )
}

/** The panel's contents. Mounted only while the panel is open, so it never fetches suggestions early. */
function PanelBody({ titleId, onClose }: { titleId: string; onClose: () => void }) {
  const { messages, pending, error, send } = useAgentThread()
  const suggestions = useAgentSuggestions()
  const { agency } = useAuth()
  const [draft, setDraft] = useState("")
  const inputId = useId()
  const lastTurn = useRef<HTMLDivElement>(null)
  const seenTurns = useRef(messages.length)

  // Keep the newest turn in view: a new question sticks to the bottom (where the pending line is); a
  // new answer is aligned to its start, so a long answer is read from the top instead of skipped past.
  useEffect(() => {
    if (messages.length === seenTurns.current) return
    seenTurns.current = messages.length
    const latest = messages[messages.length - 1]
    lastTurn.current?.scrollIntoView?.({ block: latest?.role === "assistant" ? "start" : "end" })
  }, [messages])

  const tooLong = draft.length > 500
  const nearLimit = draft.length >= 450
  const lastAssistant = [...messages].reverse().find((turn) => turn.role === "assistant")
  const followUps = pending ? [] : (lastAssistant?.body.suggestions ?? [])

  const submit = async () => {
    if (!draft.trim() || pending) return
    const answered = await send(draft)
    // On any failure (409/502/422) the typed text stays put so the ask is not lost.
    if (answered) setDraft("")
  }

  return (
    <>
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex items-center gap-2.5">
          <BrandMark size={20} />
          <div>
            <h2 id={titleId} className="font-display text-[15px] font-semibold text-ink">
              Ask Simbe
            </h2>
            <p className="text-[12px] text-ink-muted">{agency ? `${agency.name} data only` : "Your data only"}</p>
          </div>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-subtle hover:text-ink"
        >
          <X aria-hidden className="h-4 w-4" />
        </button>
      </header>

      <div role="log" aria-live="polite" aria-relevant="additions" className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex flex-col gap-3">
            <div>
              <p className="font-display text-[16px] font-semibold text-ink">How can I help this week?</p>
              <p className="mt-1 text-[13px] text-ink-secondary">
                Ask about your funnel, channels or team — I only see summaries of your data.
              </p>
            </div>
            <SuggestionChips suggestions={suggestions.data?.suggestions ?? []} loading={suggestions.isPending} onSelect={send} />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((turn, index) => (
              // The server id can repeat in tests/mocks; the index keeps React keys unique.
              <div key={`${turn.id}-${index}`} ref={index === messages.length - 1 ? lastTurn : undefined}>
                <MessageBubble turn={turn} />
              </div>
            ))}
            {pending && (
              <p role="status" className="animate-pulse text-[13px] text-ink-muted motion-reduce:animate-none">
                Reading your data…
              </p>
            )}
            {followUps.length > 0 && <SuggestionChips suggestions={followUps} onSelect={send} />}
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="shrink-0 px-4 pb-1 text-[13px] text-danger-text">
          {error}
        </p>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
        className="flex shrink-0 items-center gap-2 border-t border-line px-3 py-3"
      >
        <div className="min-w-0 flex-1">
          <label htmlFor={inputId} className="sr-only">
            Ask about your business
          </label>
          <input
            id={inputId}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            disabled={pending}
            placeholder="Ask about your business…"
            autoComplete="off"
            className="h-[38px] w-full rounded-input border border-line bg-surface px-3 text-[14px] text-ink placeholder:text-ink-faint disabled:bg-subtle"
          />
          {nearLimit && (
            <p data-testid="agent-counter" className={`mt-1 text-right text-[11px] ${tooLong ? "text-danger-text" : "text-ink-muted"}`}>
              {draft.length}/500
            </p>
          )}
        </div>
        <button
          type="submit"
          aria-label="Send"
          disabled={pending || !draft.trim()}
          className="inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-brand text-white transition-colors hover:bg-brand-hover disabled:pointer-events-none disabled:opacity-50"
        >
          <Send aria-hidden className="h-4 w-4" />
        </button>
      </form>
    </>
  )
}

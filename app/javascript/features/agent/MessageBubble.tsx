import { ArrowRight } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { useAgent } from "@/app/agent"
import { Chip } from "@/components/ui/Chip"
import { AnswerChart } from "./AnswerChart"
import { safeRoute } from "./routes"
import type { AgentTurn } from "./useAgentThread"

/**
 * One message. User turns are right-aligned `bg-subtle`; agent turns are white with a border and may
 * carry a chart, a whitelisted action button and source chips. The text is rendered as text only —
 * the model's output is never interpreted as HTML.
 */
export function MessageBubble({ turn }: { turn: AgentTurn }) {
  const navigate = useNavigate()
  const { close } = useAgent()

  if (turn.role === "user") {
    return (
      <div className="flex flex-col items-end">
        <p className="max-w-[85%] whitespace-pre-wrap rounded-[14px_14px_4px_14px] bg-subtle px-3.5 py-2.5 text-[14px] text-ink">
          {turn.body.text}
        </p>
        {turn.body.failed && <p className="mt-1 text-[11px] font-medium text-danger-text">Not sent — try again</p>}
      </div>
    )
  }

  const { text, chart, action, sources } = turn.body
  const visit = (route: string) => {
    // Belt and braces: `toTurn` already drops unsafe routes, but never navigate an unchecked one.
    const safe = safeRoute(route)
    if (!safe) return
    navigate(safe)
    close()
  }

  return (
    <div className="flex flex-col items-start gap-2.5">
      <div className="max-w-[85%] rounded-[14px_14px_14px_4px] border border-line bg-surface px-3.5 py-2.5">
        <p className="whitespace-pre-wrap text-[14px] text-ink">{text}</p>
        {chart && chart.bars.length > 0 && (
          <div className="mt-2.5">
            <AnswerChart chart={chart} />
          </div>
        )}
      </div>
      {action && (
        <button
          type="button"
          onClick={() => visit(action.route)}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-brand-border px-4 text-[14px] font-semibold text-brand-text transition-colors hover:bg-brand-tint"
        >
          {action.label}
          <ArrowRight aria-hidden className="h-4 w-4" />
        </button>
      )}
      {sources && sources.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] font-medium text-ink-muted">Sources</span>
          {sources.map((source) => (
            <Chip key={`${source.route}-${source.label}`} onClick={() => visit(source.route)}>
              {source.label}
            </Chip>
          ))}
        </div>
      )}
    </div>
  )
}

import { BarRow } from "@/components/ui/BarRow"
import type { AgentTurn } from "./useAgentThread"

type AgentChart = NonNullable<AgentTurn["body"]["chart"]>

/**
 * The agent's inline chart in the app's usual style (the kit's `BarRow`, as on This week's
 * "Qualified rate by channel"): one horizontal row per datum — label left, a thin bar scaled to the
 * largest value, the value right. A single datum is one proportional row, never a column that
 * fills the panel; long labels truncate (`min-w-0`) instead of overflowing at 390px.
 */
export function AnswerChart({ chart }: { chart: AgentChart }) {
  const max = chart.bars.reduce((largest, bar) => Math.max(largest, Number.isFinite(bar.value) && bar.value > 0 ? bar.value : 0), 0)
  const alternative = `${chart.title}: ${chart.bars.map((bar) => `${bar.label} ${bar.display}`).join(", ")}`
  return (
    <div className="rounded-card bg-app p-3" role="img" aria-label={alternative}>
      <p className="mb-2.5 text-[12px] font-medium text-ink-secondary">{chart.title}</p>
      <div className="flex flex-col gap-3">
        {chart.bars.map((bar, index) => (
          <BarRow
            key={`${bar.label}-${index}`}
            label={bar.label}
            value={bar.display}
            pct={max > 0 ? (Math.max(0, bar.value) / max) * 100 : 0}
            tone="brand"
            labelClassName="min-w-0 text-ink-secondary"
          />
        ))}
      </div>
    </div>
  )
}

export type BarChartBar = { label: string; value: number; display?: string }

/**
 * The agent's inline chart. Bars are normalised to the largest value; the text
 * alternative lists every bar so the answer never depends on the picture.
 */
export function BarChart({ title, bars }: { title: string; bars: BarChartBar[] }) {
  const max = bars.reduce((largest, bar) => Math.max(largest, bar.value), 0)
  const alternative = `${title}: ${bars.map((bar) => `${bar.label} ${bar.display ?? bar.value}`).join(", ")}`

  return (
    <div className="rounded-card bg-app p-3" role="img" aria-label={alternative}>
      <p className="mb-2 text-[12px] font-medium text-ink-secondary">{title}</p>
      <div className="flex h-24 items-end gap-2">
        {bars.map((bar) => (
          <div key={bar.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span className="text-[11px] text-ink-muted">{bar.display ?? bar.value}</span>
            <span
              data-testid="bar"
              className="w-full rounded-t bg-brand"
              style={{ height: max > 0 ? `${(bar.value / max) * 100}%` : "0%" }}
            />
            <span className="w-full truncate text-center text-[11px] text-ink-muted" title={bar.label}>
              {bar.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

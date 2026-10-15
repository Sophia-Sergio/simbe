export type BarChartBar = { label: string; value: number; display?: string }

/** Negative and non-finite values read as zero; only real values get a bar. */
function normalise(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0
}

/**
 * The agent's inline chart. Bars are normalised to the largest value; the text
 * alternative lists every bar so the answer never depends on the picture.
 */
export function BarChart({ title, bars }: { title: string; bars: BarChartBar[] }) {
  const values = bars.map((bar) => normalise(bar.value))
  const max = values.reduce((largest, value) => Math.max(largest, value), 0)
  const alternative = `${title}: ${bars.map((bar, index) => `${bar.label} ${bar.display ?? values[index]}`).join(", ")}`

  return (
    <div className="rounded-card bg-app p-3" role="img" aria-label={alternative}>
      <p className="mb-2 text-[12px] font-medium text-ink-secondary">{title}</p>
      <div className="flex h-24 items-end gap-2">
        {bars.map((bar, index) => (
          <div key={`${bar.label}-${index}`} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span className="text-[11px] text-ink-muted">{bar.display ?? values[index]}</span>
            <span
              data-testid="bar"
              className="w-full rounded-t bg-brand"
              style={{
                height: max > 0 ? `${(values[index] / max) * 100}%` : "0%",
                minHeight: values[index] > 0 ? "2px" : undefined,
              }}
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

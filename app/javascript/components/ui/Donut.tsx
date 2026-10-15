const SIZE = 92
const STROKE = 12
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/**
 * "Biggest leak" ring: a green track with an amber arc for `pct`%. Always prints
 * its value in the middle, so the colour is never the only meaning.
 */
export function Donut({ pct, label, sublabel }: { pct: number; label: string; sublabel?: string }) {
  const clamped = Math.max(0, Math.min(100, pct || 0))
  const arc = (clamped / 100) * CIRCUMFERENCE
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: SIZE, height: SIZE }}>
      <svg
        role="img"
        aria-label={label}
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="-rotate-90"
      >
        <circle
          data-testid="track"
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          className="stroke-success"
        />
        <circle
          data-testid="arc"
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={`${arc} ${CIRCUMFERENCE}`}
          className="stroke-warning"
        />
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-[20px] font-semibold tracking-tight text-ink">{label}</span>
        {sublabel ? <span className="text-[11px] text-ink-muted">{sublabel}</span> : null}
      </div>
    </div>
  )
}

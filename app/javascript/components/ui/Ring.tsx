const SIZE = 84
const STROKE = 12
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export type RingProps = {
  met: number
  review: number
  notMet: number
  unanswered: number
}

/** Screener ring: met / review / red-flag / unanswered segments with a printed legend. */
export function Ring({ met, review, notMet, unanswered }: RingProps) {
  const total = met + review + notMet + unanswered
  const pct = total === 0 ? "—" : `${Math.round((met / total) * 100)}%`

  const counts = [met, review, notMet, unanswered]
  const lengths = counts.map((count) => (total === 0 ? 0 : (count / total) * CIRCUMFERENCE))
  const offsets = lengths.reduce<number[]>((acc, _length, index) => {
    acc.push(index === 0 ? 0 : acc[index - 1] + lengths[index - 1])
    return acc
  }, [])
  const strokes = ["stroke-success", "stroke-warning", "stroke-danger", "stroke-line"]

  const legend = `${met} met · ${notMet} red flags · ${review} to review · ${unanswered} unanswered`

  return (
    <div className="flex items-center gap-3">
      <div className="relative inline-flex items-center justify-center" style={{ width: SIZE, height: SIZE }}>
        <svg
          role="img"
          aria-label={`Screener progress ${pct}: ${legend}`}
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="-rotate-90"
        >
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            strokeWidth={STROKE}
            className="stroke-subtle"
          />
          {lengths.map((length, index) => (
            <circle
              key={strokes[index]}
              data-testid="ring-segment"
              data-state={["met", "review", "notMet", "unanswered"][index]}
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              strokeWidth={STROKE}
              strokeDasharray={`${length} ${CIRCUMFERENCE}`}
              strokeDashoffset={-offsets[index]}
              className={strokes[index]}
            />
          ))}
        </svg>
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-[20px] font-semibold tracking-tight text-ink">{pct}</span>
          <span className="text-[11px] text-ink-muted">Progress</span>
        </div>
      </div>
      <p className="text-[12px] text-ink-muted">{legend}</p>
    </div>
  )
}

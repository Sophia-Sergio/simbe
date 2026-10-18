// KPI bar: a single green (or toned) fill, or the cost card's green/amber/red thirds.

type SegmentFillTone = "success" | "brand" | "warning" | "danger"

export type SegmentBarProps =
  | { kind: "fill"; pct: number; tone?: SegmentFillTone }
  | { kind: "thirds"; active: 0 | 1 | 2 }

const FILL_TONES: Record<SegmentFillTone, string> = {
  success: "bg-success",
  brand: "bg-brand",
  warning: "bg-warning",
  danger: "bg-danger",
}

const THIRDS = ["bg-success", "bg-warning", "bg-danger"]

export function SegmentBar(props: SegmentBarProps) {
  if (props.kind === "thirds") {
    return (
      <div className="flex h-1.5 gap-1" role="presentation">
        {THIRDS.map((color, index) => (
          <span
            key={color}
            className={`h-full flex-1 rounded-full ${color} ${index === props.active ? "opacity-100" : "opacity-30"}`}
          />
        ))}
      </div>
    )
  }

  const pct = Math.max(0, Math.min(100, props.pct || 0))
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-subtle" role="presentation">
      <span className={`block h-full rounded-full ${FILL_TONES[props.tone ?? "success"]}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

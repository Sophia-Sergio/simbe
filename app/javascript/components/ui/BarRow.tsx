import type { ReactNode } from "react"

export type BarTone = "dark" | "brand" | "success" | "warning" | "danger" | "muted"

const BAR_TONES: Record<BarTone, string> = {
  dark: "bg-ink",
  brand: "bg-brand",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  muted: "bg-line-strong",
}

/** Horizontal bar: label on the left, value on the right, 10px track. */
export function BarRow({
  label,
  value,
  pct,
  tone = "muted",
  right,
  labelClassName = "text-ink-secondary",
}: {
  label: string
  value: string
  pct: number
  tone?: BarTone
  right?: ReactNode
  /** Colour/weight of the label (e.g. emphasise the qualified funnel row). */
  labelClassName?: string
}) {
  const clamped = Math.max(0, Math.min(100, pct || 0))
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2 text-[13px]">
        <span className={`truncate ${labelClassName}`} title={label}>
          {label}
        </span>
        <span className="flex shrink-0 items-center gap-1 font-medium text-ink">
          {value}
          {right}
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-subtle">
        <span data-tone={tone} className={`block h-full rounded-full ${BAR_TONES[tone]}`} style={{ width: `${clamped}%` }} />
      </div>
    </div>
  )
}

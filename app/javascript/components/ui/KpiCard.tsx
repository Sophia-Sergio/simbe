import type { DeltaTone } from "@/lib/format"
import { SegmentBar } from "./SegmentBar"
import type { SegmentBarProps } from "./SegmentBar"

export type KpiDelta = { text: string; tone: DeltaTone }

const DELTA_TONES: Record<DeltaTone, string> = {
  up: "text-success-text",
  down: "text-warning-text",
  none: "text-ink-muted",
}

export function KpiCard({
  label,
  value,
  delta,
  note,
  subnote,
  subnoteTitle,
  bar,
  size = "md",
}: {
  label: string
  value: string
  delta?: KpiDelta
  note?: string
  /** A second muted line, with a native tooltip, for a count that needs explaining. */
  subnote?: string
  subnoteTitle?: string
  bar: SegmentBarProps
  size?: "md" | "sm"
}) {
  return (
    <div className="rounded-card border border-line bg-surface p-4 shadow-card">
      <p className="text-[13px] text-ink-muted">{label}</p>
      <div className="mt-1 flex flex-wrap items-baseline gap-2">
        <span
          className={`font-display font-semibold tracking-tight text-ink ${
            size === "sm" ? "text-[24px]" : "text-[28px]"
          }`}
        >
          {value}
        </span>
        {delta && delta.text ? (
          <span data-testid="kpi-delta" className={`text-[13px] font-medium ${DELTA_TONES[delta.tone]}`}>
            {delta.text}
          </span>
        ) : null}
      </div>
      <div className="mt-3">
        <SegmentBar {...bar} />
      </div>
      {note ? <p className="mt-2 text-[12px] text-ink-muted">{note}</p> : null}
      {subnote ? (
        <p title={subnoteTitle} className="mt-0.5 text-[12px] text-ink-muted">
          {subnote}
        </p>
      ) : null}
    </div>
  )
}

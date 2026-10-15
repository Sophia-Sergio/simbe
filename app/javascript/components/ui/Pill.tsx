import type { ReactNode } from "react"

export type PillTone = "neutral" | "success" | "warning" | "danger" | "violet" | "brand" | "outline"

export const PILL_TONES: Record<PillTone, string> = {
  neutral: "border-line bg-subtle text-ink-secondary",
  success: "border-success-border bg-success-bg text-success-text",
  warning: "border-warning-border bg-warning-bg text-warning-text",
  danger: "border-danger-border bg-danger-bg text-danger-text",
  violet: "border-violet-border bg-violet-bg text-violet-text",
  brand: "border-brand-border bg-brand-tint text-brand-text",
  outline: "border-line bg-transparent text-ink-secondary",
}

export function Pill({ tone = "neutral", className = "", children }: { tone?: PillTone; className?: string; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${PILL_TONES[tone]} ${className}`}
    >
      {children}
    </span>
  )
}

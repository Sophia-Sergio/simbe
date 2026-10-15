import type { ReactNode } from "react"

export type SegmentedOption<T extends string> = { value: T; label: ReactNode }

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  fullWidth = false,
  className = "",
  "aria-label": ariaLabel,
}: {
  value: T
  options: SegmentedOption<T>[]
  onChange: (value: T) => void
  fullWidth?: boolean
  className?: string
  "aria-label"?: string
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`inline-flex flex-nowrap items-center gap-0.5 rounded-full bg-subtle p-0.5 ${fullWidth ? "w-full" : ""} ${className}`}
    >
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={`whitespace-nowrap rounded-full px-3 py-1 text-[13px] font-medium transition-colors ${
              fullWidth ? "min-w-0 flex-1 text-center" : ""
            } ${selected ? "bg-surface text-ink shadow-card" : "text-ink-muted hover:text-ink-secondary"}`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

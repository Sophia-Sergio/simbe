import type { ReactNode } from "react"

export type SegmentedOption<T extends string> = { value: T; label: ReactNode }

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className = "",
  "aria-label": ariaLabel,
}: {
  value: T
  options: SegmentedOption<T>[]
  onChange: (value: T) => void
  className?: string
  "aria-label"?: string
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`inline-flex max-w-full flex-nowrap items-center gap-1 overflow-x-auto rounded-full bg-subtle p-0.5 ${className}`}
    >
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={`min-h-11 min-w-11 whitespace-nowrap rounded-full px-3 py-1 text-[13px] font-medium transition-colors focus-visible:-outline-offset-2 md:min-h-0 md:min-w-0 ${
              selected ? "bg-surface text-ink shadow-card" : "text-ink-muted hover:text-ink-secondary"
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

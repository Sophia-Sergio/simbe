import type { ReactNode } from "react"

export function Chip({
  selected = false,
  onClick,
  leading,
  disabled = false,
  className = "",
  children,
}: {
  selected?: boolean
  onClick?: () => void
  leading?: ReactNode
  disabled?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-[13px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 ${
        selected
          ? "border-brand-border bg-brand-tint text-brand-text"
          : "border-line bg-surface text-ink-secondary hover:bg-subtle"
      } ${className}`}
    >
      {leading}
      {children}
    </button>
  )
}

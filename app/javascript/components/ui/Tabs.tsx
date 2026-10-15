import { useRef } from "react"
import type { KeyboardEvent, ReactNode } from "react"

export type TabItem<T extends string> = { value: T; label: ReactNode }

/** Full-width segmented control with `tablist`/`tab` semantics; ←/→ move the selection. */
export function Tabs<T extends string>({
  value,
  onChange,
  tabs,
  className = "",
  "aria-label": ariaLabel,
}: {
  value: T
  onChange: (value: T) => void
  tabs: TabItem<T>[]
  className?: string
  "aria-label"?: string
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])

  // Fall back to the first tab: with `value` matching nothing every tab would be
  // tabIndex -1 and the tablist would be unreachable by keyboard.
  const match = tabs.findIndex((tab) => tab.value === value)
  const activeIndex = match >= 0 ? match : 0

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (tabs.length === 0) return
    const index = activeIndex
    let next: number
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length
    else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length
    else return
    event.preventDefault()
    onChange(tabs[next].value)
    refs.current[next]?.focus()
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={`inline-flex w-full flex-nowrap items-center gap-0.5 rounded-full bg-subtle p-0.5 ${className}`}
    >
      {tabs.map((tab, index) => {
        const selected = index === activeIndex
        return (
          <button
            key={tab.value}
            ref={(el) => {
              refs.current[index] = el
            }}
            role="tab"
            type="button"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.value)}
            className={`min-w-0 flex-1 whitespace-nowrap rounded-full px-3 py-1 text-center text-[13px] font-medium transition-colors ${
              selected ? "bg-surface text-ink shadow-card" : "text-ink-muted hover:text-ink-secondary"
            }`}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

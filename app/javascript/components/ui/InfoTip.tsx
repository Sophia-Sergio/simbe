import { useEffect, useId, useRef, useState } from "react"
import type { ReactNode } from "react"

/**
 * A small "i" button that explains a number in place. The tip opens on hover and focus (desktop)
 * and on tap (mobile); Escape or a tap elsewhere closes it. `label` names the button.
 */
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLSpanElement>(null)
  const tipId = useId()

  useEffect(() => {
    if (!open) return
    const close = (event: Event) => {
      if (event.type === "keydown" && (event as KeyboardEvent).key !== "Escape") return
      if (event.type === "pointerdown" && root.current?.contains(event.target as Node)) return
      setOpen(false)
    }
    document.addEventListener("keydown", close)
    document.addEventListener("pointerdown", close)
    return () => {
      document.removeEventListener("keydown", close)
      document.removeEventListener("pointerdown", close)
    }
  }, [open])

  return (
    <span ref={root} className="relative inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-label={label}
        aria-describedby={open ? tipId : undefined}
        aria-expanded={open}
        onClick={() => setOpen(true)}
        onFocus={() => setOpen(true)}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-line text-[10px] font-semibold leading-none text-ink-muted hover:text-ink focus-visible:text-ink"
      >
        i
      </button>
      {open && (
        <span
          id={tipId}
          role="tooltip"
          className="absolute right-0 top-full z-20 mt-2 w-64 rounded-row border border-line bg-surface p-3 text-left text-[12px] font-normal normal-case leading-snug tracking-normal text-ink-secondary shadow-card"
        >
          {children}
        </span>
      )}
    </span>
  )
}

import { useEffect, useId, useRef, useState } from "react"
import type { ReactNode } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { useDismiss } from "@/hooks/useDismiss"
import { useIsDesktop } from "@/hooks/useIsDesktop"
import { useFocusTrap, useLockBody, useReturnFocus } from "./Modal"

export type SheetProps = {
  open: boolean
  onClose: () => void
  title?: string
  header?: ReactNode
  children: ReactNode
  className?: string
}

/** Right slide-over panel on desktop (620px), full screen below 860px. */
export function Sheet({ open, onClose, title, header, children, className = "" }: SheetProps) {
  const isDesktop = useIsDesktop()
  const ref = useRef<HTMLDivElement>(null)
  const [entered, setEntered] = useState(false)
  const titleId = useId()

  useDismiss({ ref, onDismiss: onClose, enabled: open })
  useFocusTrap(ref, open)
  useLockBody(open)
  useReturnFocus(ref, open)

  // Two-phase entrance: paint the offset first, then transition to the resting position.
  useEffect(() => {
    const enterTimer = window.setTimeout(() => setEntered(open), 0)
    return () => window.clearTimeout(enterTimer)
  }, [open])

  if (!open || typeof document === "undefined") return null

  const panel = isDesktop
    ? "absolute right-0 top-0 flex h-full w-[620px] max-w-full flex-col bg-surface shadow-modal transition duration-200 ease-out motion-reduce:transition-none"
    : "fixed inset-0 flex h-full w-full flex-col bg-surface transition duration-200 ease-out motion-reduce:transition-none"

  const motion = isDesktop
    ? entered
      ? "translate-x-0 opacity-100"
      : "translate-x-6 opacity-0"
    : entered
      ? "translate-y-0 opacity-100"
      : "translate-y-4 opacity-0"

  return createPortal(
    <div className="fixed inset-0 z-50">
      {isDesktop && <div data-testid="scrim" className="absolute inset-0 bg-app/60" />}
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title && !header ? titleId : undefined}
        tabIndex={-1}
        data-variant={isDesktop ? "panel" : "full"}
        className={`${panel} ${motion} ${className}`}
      >
        {header ?? (
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-5 py-4">
            {title && (
              <h2 id={titleId} className="font-display text-[16px] font-semibold text-ink">
                {title}
              </h2>
            )}
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="ml-auto inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-subtle hover:text-ink md:h-8 md:w-8"
            >
              <X aria-hidden className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-[14px] text-ink-secondary">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

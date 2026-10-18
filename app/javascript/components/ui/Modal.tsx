import { useEffect, useId, useRef } from "react"
import type { ReactNode, RefObject } from "react"
import { createPortal } from "react-dom"
import { useDismiss } from "@/hooks/useDismiss"
import { useIsDesktop } from "@/hooks/useIsDesktop"

const FOCUSABLE_SELECTOR =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

/** Keeps Tab inside the dialog while it is open. Shared with `Sheet`. */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    if (!active) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return
      const el = ref.current
      if (!el) return
      const nodes = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((node) => node.tabIndex !== -1)
      if (nodes.length === 0) {
        event.preventDefault()
        el.focus()
        return
      }
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      const current = document.activeElement
      if (event.shiftKey && (current === first || current === el)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && current === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener("keydown", onKeyDown, true)
    return () => document.removeEventListener("keydown", onKeyDown, true)
  }, [ref, active])
}

/** Locks body scroll and hides the rest of the app from assistive tech while open. */
export function useLockBody(active: boolean): void {
  useEffect(() => {
    if (!active) return
    const root = document.getElementById("root")
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    root?.setAttribute("inert", "")
    root?.setAttribute("aria-hidden", "true")
    return () => {
      document.body.style.overflow = previousOverflow
      root?.removeAttribute("inert")
      root?.removeAttribute("aria-hidden")
    }
  }, [active])
}

/** Moves focus into the dialog on open and returns it to the opener on close. Shared with `Sheet`. */
export function useReturnFocus(ref: RefObject<HTMLElement | null>, active: boolean): void {
  const opener = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (!active) return
    opener.current = (document.activeElement as HTMLElement | null) ?? null
    const el = ref.current
    const first = el?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
    ;(first ?? el)?.focus()
    return () => {
      opener.current?.focus?.()
    }
  }, [ref, active])
}

export type ModalProps = {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  footer?: ReactNode
  size?: "sm" | "md"
  className?: string
  /** Extra classes for the footer row, e.g. full-width stacked buttons on mobile. */
  footerClassName?: string
  /** Accessible name for a dialog without a visible title (e.g. the search palette). */
  ariaLabel?: string
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
  className = "",
  footerClassName = "",
  ariaLabel,
}: ModalProps) {
  const isDesktop = useIsDesktop()
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useDismiss({ ref, onDismiss: onClose, enabled: open })
  useFocusTrap(ref, open)
  useLockBody(open)
  useReturnFocus(ref, open)

  if (!open || typeof document === "undefined") return null

  const panel = isDesktop
    ? `relative flex w-full ${size === "sm" ? "max-w-[400px]" : "max-w-[480px]"} max-h-[calc(100dvh-2rem)] flex-col rounded-modal bg-surface shadow-modal`
    : "relative flex max-h-[90dvh] w-full flex-col rounded-sheet bg-surface pb-[env(safe-area-inset-bottom)] shadow-modal"

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div data-testid="scrim" className="absolute inset-0 bg-dark/40" />
      <div className={isDesktop ? "absolute inset-0 flex items-center justify-center p-4" : "absolute inset-x-0 bottom-0"}>
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? titleId : undefined}
          aria-label={!title ? ariaLabel : undefined}
          tabIndex={-1}
          data-variant={isDesktop ? "modal" : "sheet"}
          className={`${panel} ${className}`}
        >
          {!isDesktop && <div aria-hidden className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-line-strong" />}
          {title && (
            <h2 id={titleId} className="shrink-0 px-5 pt-4 font-display text-[16px] font-semibold text-ink">
              {title}
            </h2>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-[14px] text-ink-secondary">{children}</div>
          {footer && (
            <div className={`flex shrink-0 justify-end gap-2 border-t border-line px-5 py-3 ${footerClassName}`}>{footer}</div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

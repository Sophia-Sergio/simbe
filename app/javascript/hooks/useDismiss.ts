import { useEffect, useRef } from "react"
import type { RefObject } from "react"

/**
 * Closes an overlay on Escape or a pointerdown outside `ref`. Mounted only while `enabled`,
 * so a closed dialog never leaves listeners behind.
 */
export function useDismiss({
  ref,
  onDismiss,
  enabled = true,
}: {
  ref: RefObject<HTMLElement | null>
  onDismiss: () => void
  enabled?: boolean
}): void {
  const handler = useRef(onDismiss)

  useEffect(() => {
    handler.current = onDismiss
  }, [onDismiss])

  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") handler.current()
    }
    const onPointerDown = (event: PointerEvent) => {
      const el = ref.current
      if (!el) return
      const target = event.target
      if (target instanceof Node && el.contains(target)) return
      handler.current()
    }
    document.addEventListener("keydown", onKeyDown)
    document.addEventListener("pointerdown", onPointerDown)
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      document.removeEventListener("pointerdown", onPointerDown)
    }
  }, [ref, enabled])
}

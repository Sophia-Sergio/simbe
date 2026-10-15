import { useEffect, useState } from "react"

function matches(query: string): boolean {
  // SSR / non-DOM: assume the desktop layout (there is no viewport to measure).
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true
  return window.matchMedia(query).matches
}

/**
 * Subscribes to a CSS media query. Re-evaluates on `resize` (so viewport stubs and real
 * window resizes both work) and on the MediaQueryList `change` event when available.
 */
export function useMediaQuery(query: string): boolean {
  const [value, setValue] = useState(() => matches(query))

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return
    const mql = window.matchMedia(query)
    const update = () => {
      // Re-read from window each time: viewport stubs replace matchMedia and fire `resize`.
      setValue(window.matchMedia(query).matches)
    }
    update()
    mql.addEventListener?.("change", update)
    window.addEventListener("resize", update)
    return () => {
      mql.removeEventListener?.("change", update)
      window.removeEventListener("resize", update)
    }
  }, [query])

  return value
}

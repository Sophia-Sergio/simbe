import { useCallback, useMemo, useSyncExternalStore } from "react"
import { useLocation, useSearchParams } from "react-router-dom"

export type LeadTab = "summary" | "screener" | "activity" | "source"

const TABS: readonly LeadTab[] = ["summary", "screener", "activity", "source"]
const isTab = (value: string | null): value is LeadTab => TABS.includes(value as LeadTab)

// The ordered ids of the list the panel was opened from, tagged with that list's path. Reading
// them from any other path yields [], which is how they are "cleared on navigation away".
let store: { path: string; ids: string[] } = { path: "", ids: [] }
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
const getSnapshot = () => store

/** Test seam: drops the registered ids so one test cannot see another's list. */
export function resetLeadPanelIds(): void {
  store = { path: "", ids: [] }
  listeners.forEach((listener) => listener())
}

export type LeadPanel = {
  leadId: string | null
  tab: LeadTab
  open: (id: string, tab?: LeadTab) => void
  close: () => void
  setIds: (ids: string[]) => void
  prev: () => void
  next: () => void
  hasPrev: boolean
  hasNext: boolean
}

/** Lead panel state lives in the URL (`?lead=<id>&tab=<tab>`), so it survives reloads and back/forward. */
export function useLeadPanel(): LeadPanel {
  const [params, setParams] = useSearchParams()
  const { pathname } = useLocation()
  const current = useSyncExternalStore(subscribe, getSnapshot)

  const leadId = params.get("lead")
  const rawTab = params.get("tab")
  const tab: LeadTab = isTab(rawTab) ? rawTab : "summary"
  const ids = useMemo(() => (current.path === pathname ? current.ids : []), [current, pathname])
  const index = leadId ? ids.indexOf(leadId) : -1
  // prev/next wrap around, so with two or more ids both are always available.
  const hasPrev = index >= 0 && ids.length > 1
  const hasNext = hasPrev

  const open = useCallback(
    (id: string, nextTab?: LeadTab) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.set("lead", id)
          if (nextTab) next.set("tab", nextTab)
          else if (!isTab(next.get("tab"))) next.delete("tab")
          return next
        },
        { replace: false },
      )
    },
    [setParams],
  )

  const isOpen = params.has("lead") || params.has("tab")
  const close = useCallback(() => {
    if (!isOpen) return // nothing to close: do not push a duplicate history entry
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete("lead")
      next.delete("tab")
      return next
    })
  }, [isOpen, setParams])

  const setIds = useCallback(
    (list: string[]) => {
      const same = store.path === pathname && store.ids.length === list.length && store.ids.every((id, i) => id === list[i])
      if (same) return
      store = { path: pathname, ids: list }
      listeners.forEach((listener) => listener())
    },
    [pathname],
  )

  const step = useCallback(
    (delta: 1 | -1) => {
      if (index < 0 || ids.length === 0) return
      const target = ids[(index + delta + ids.length) % ids.length]
      setParams((prev) => {
        const next = new URLSearchParams(prev)
        next.set("lead", target)
        return next
      })
    },
    [ids, index, setParams],
  )

  const prev = useCallback(() => step(-1), [step])
  const next = useCallback(() => step(1), [step])

  return { leadId, tab, open, close, setIds, prev, next, hasPrev, hasNext }
}

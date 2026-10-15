import { useCallback, useRef, useState } from "react"
import type { ShellProps } from "../types"
import { Sidebar } from "./Sidebar"
import { TopBar } from "./TopBar"

const STORAGE_KEY = "simbe.sidebar"

// Storage can throw (private windows, blocked site data): the shell must render without it.
function readCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "collapsed"
  } catch {
    return false
  }
}
function writeCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, collapsed ? "collapsed" : "expanded")
  } catch {
    /* a convenience only */
  }
}

/** The ≥860px shell: sidebar, top bar, a 1200px main column, overlays and the FAB slot. */
export function DesktopShell({ user, agency, nav, overlays, fab, topBarRight, onSignOut, children }: ShellProps) {
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const main = useRef<HTMLElement>(null)

  const toggle = useCallback(() => {
    setCollapsed((value) => {
      writeCollapsed(!value)
      return !value
    })
  }, [])

  return (
    <div data-shell="desktop" className="flex min-h-screen bg-app">
      <a
        href="#main"
        onClick={(event) => {
          event.preventDefault()
          main.current?.focus()
        }}
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-full focus:bg-surface focus:px-4 focus:py-2 focus:text-[14px] focus:font-semibold focus:text-brand-text focus:shadow-modal"
      >
        Skip to content
      </a>
      <Sidebar nav={nav} agency={agency} user={user} collapsed={collapsed} onToggle={toggle} onSignOut={onSignOut} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar user={user} topBarRight={topBarRight} onSignOut={onSignOut} />
        <main id="main" ref={main} tabIndex={-1} className="mx-auto w-full max-w-[1200px] px-8 pb-[110px] pt-7 outline-none">
          {children}
        </main>
      </div>
      {overlays}
      <div className="fixed bottom-6 right-6 z-40">{fab}</div>
    </div>
  )
}

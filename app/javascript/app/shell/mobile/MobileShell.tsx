import { useEffect, useMemo, useState } from "react"
import { useLocation } from "react-router-dom"
import type { ShellProps } from "../types"
import { MoreSheet } from "./MoreSheet"
import { TabBar } from "./TabBar"
import { isActivePath } from "./TabItem"
import { TopBar } from "./TopBar"

/** The <860px shell: top bar, scrolling main with room for the tab bar, tab bar, overlays. Never renders the FAB. */
export function MobileShell({ user, nav, title, overlays, onSignOut, children }: ShellProps) {
  const { pathname } = useLocation()
  // The sheet is open for the path it was opened on, so any navigation closes it without an effect.
  const [moreFor, setMoreFor] = useState<string | null>(null)
  const moreOpen = moreFor === pathname

  const tabs = useMemo(
    () => nav.filter((item) => item.mobile?.tab).sort((a, b) => (a.mobile!.tab!.order ?? 0) - (b.mobile!.tab!.order ?? 0)),
    [nav],
  )
  const more = useMemo(
    () => nav.filter((item) => item.mobile?.more).sort((a, b) => (a.mobile!.more!.order ?? 0) - (b.mobile!.more!.order ?? 0)),
    [nav],
  )
  const moreActive = more.some((item) => item.to !== undefined && isActivePath(pathname, item.to))

  // Every navigation starts the next screen at the top.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    <div data-shell="mobile" className="min-h-screen bg-app">
      <TopBar title={title} user={user} onSignOut={onSignOut} />
      <main className="px-[14px] pb-[110px] pt-[18px]">{children}</main>
      <TabBar tabs={tabs} hasMore={more.length > 0} onMore={() => setMoreFor(pathname)} moreActive={moreActive} />
      <MoreSheet items={more} open={moreOpen} onClose={() => setMoreFor(null)} />
      {overlays}
    </div>
  )
}

import { MoreHorizontal } from "lucide-react"
import type { NavItem } from "../../feature"
import { TabItem } from "./TabItem"

export type TabBarProps = {
  tabs: NavItem[]
  hasMore: boolean
  onMore: () => void
  moreActive: boolean
}

/** Fixed bottom bar: any list of tabs, plus a trailing More tab only when there are More rows. */
export function TabBar({ tabs, hasMore, onMore, moreActive }: TabBarProps) {
  if (tabs.length === 0 && !hasMore) return null // an empty bar would be a stray 1px line
  return (
    <nav
      aria-label="Tabs"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      {tabs.map((item) => (
        <TabItem key={item.id} item={item} />
      ))}
      {hasMore && (
        <button
          type="button"
          onClick={onMore}
          aria-haspopup="dialog"
          className={`flex h-[58px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${moreActive ? "text-brand-text" : "text-ink-muted"}`}
        >
          <MoreHorizontal aria-hidden className="h-[22px] w-[22px]" strokeWidth={moreActive ? 2.2 : 1.8} />
          <span>More</span>
        </button>
      )}
    </nav>
  )
}

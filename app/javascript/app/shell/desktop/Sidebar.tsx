import { ChevronsLeft, ChevronsRight, LogOut } from "lucide-react"
import type { Agency, User } from "@/api/types"
import { Avatar } from "@/components/ui/Avatar"
import { BrandMark } from "@/components/ui/BrandMark"
import type { NavItem } from "../../feature"
import { AgencySwitcher } from "./AgencySwitcher"
import { NavSection, SECTION_ORDER } from "./NavSection"

export type SidebarProps = {
  nav: NavItem[]
  agency: Agency
  user: User
  collapsed: boolean
  onToggle: () => void
  onSignOut: () => void
}

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)

/** 224px (64px collapsed) left rail, built only from the `nav` it is given. */
export function Sidebar({ nav, agency, user, collapsed, onToggle, onSignOut }: SidebarProps) {
  // Mobile-only entries (e.g. the Ask tab) never show here.
  const items = nav.filter((item) => item.desktop !== false)
  const Chevron = collapsed ? ChevronsRight : ChevronsLeft
  const toggle = (
    <button
      type="button"
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      onClick={onToggle}
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-faint hover:bg-subtle hover:text-ink"
    >
      <Chevron aria-hidden className="h-4 w-4" />
    </button>
  )

  return (
    <aside
      data-testid="sidebar"
      className={`sticky top-0 flex h-screen shrink-0 flex-col border-r border-line bg-surface ${collapsed ? "w-16" : "w-56"}`}
    >
      <div className={`flex shrink-0 items-center px-4 ${collapsed ? "h-auto flex-col gap-1 py-3" : "h-14 justify-between"}`}>
        <div className="flex items-center gap-2">
          <BrandMark size={28} />
          {!collapsed && <span className="font-display text-[18px] font-semibold text-ink">Simbe</span>}
        </div>
        {toggle}
      </div>
      <div className="px-2.5 pb-2">
        <AgencySwitcher agency={agency} collapsed={collapsed} />
      </div>
      <nav aria-label="Primary" className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {SECTION_ORDER.flatMap(({ key, label }) => {
          const section = items.filter((item) => item.section === key)
          return section.length ? [<NavSection key={key} label={label} items={section} collapsed={collapsed} />] : []
        })}
      </nav>
      <div className={`flex shrink-0 items-center gap-2.5 border-t border-line p-3 ${collapsed ? "flex-col" : ""}`}>
        <Avatar name={user.name} size={30} />
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p title={user.name} className="truncate text-[13px] font-semibold text-ink">
              {user.name}
            </p>
            <p className="truncate text-[11px] text-ink-muted">{capitalize(user.role)}</p>
          </div>
        )}
        <button
          type="button"
          aria-label="Sign out"
          title="Sign out"
          onClick={onSignOut}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-subtle hover:text-ink"
        >
          <LogOut aria-hidden className="h-4 w-4" />
        </button>
      </div>
    </aside>
  )
}

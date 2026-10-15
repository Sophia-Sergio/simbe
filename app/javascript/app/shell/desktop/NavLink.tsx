import { Link, useLocation } from "react-router-dom"
import type { NavItem } from "../../feature"

/** `/` matches only itself; every other target also matches its nested routes (`/channels/Facebook`). */
export function isActivePath(pathname: string, to: string): boolean {
  if (to === "/") return pathname === "/"
  return pathname === to || pathname.startsWith(`${to}/`)
}

const BASE =
  "flex h-9 w-full items-center gap-3 rounded-full text-[14px] transition-colors"
const IDLE = "font-medium text-ink-secondary hover:bg-subtle"
const ACTIVE = "bg-brand-tint font-semibold text-brand-text"

function Content({ item, collapsed, badge }: { item: NavItem; collapsed: boolean; badge?: number }) {
  const Icon = item.icon
  return (
    <>
      <Icon aria-hidden className="h-[18px] w-[18px] shrink-0" />
      <span className={collapsed ? "sr-only" : "min-w-0 flex-1 truncate text-left"}>{item.label}</span>
      {!collapsed && badge ? (
        <span className="rounded-full border border-line bg-surface px-2 text-[11px] font-semibold text-ink-secondary">{badge}</span>
      ) : null}
    </>
  )
}

function Badged({ item, collapsed, className, to }: { item: NavItem; collapsed: boolean; className: string; to: string }) {
  const badge = item.useBadge?.() // stable per item: a registry item either always or never has the hook
  return (
    <Link to={to} title={item.label} aria-current={isActivePath(useLocation().pathname, to) ? "page" : undefined} className={className}>
      <Content item={item} collapsed={collapsed} badge={badge} />
    </Link>
  )
}

function Action({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const onSelect = item.useOnSelect?.()
  return (
    <button type="button" title={item.label} onClick={onSelect} className={`${BASE} ${IDLE} ${collapsed ? "justify-center" : "px-3"}`}>
      <Content item={item} collapsed={collapsed} />
    </button>
  )
}

/** One sidebar entry: a link (with optional count pill) or, for `useOnSelect` items, a button. */
export function NavLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const { pathname } = useLocation()
  if (item.useOnSelect) return <Action item={item} collapsed={collapsed} />
  if (!item.to) return null
  const active = isActivePath(pathname, item.to)
  const className = `${BASE} ${active ? ACTIVE : IDLE} ${collapsed ? "justify-center" : "px-3"}`
  return <Badged item={item} collapsed={collapsed} className={className} to={item.to} />
}

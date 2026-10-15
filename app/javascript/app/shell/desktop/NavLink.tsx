import { Link, useLocation } from "react-router-dom"
import type { NavItem } from "../../feature"

/** `/` matches only itself; every other target also matches its nested routes (`/channels/Facebook`). Case-insensitive, like the router. */
export function isActivePath(pathname: string, to: string): boolean {
  const path = pathname.toLowerCase()
  const target = to.toLowerCase()
  if (target === "/") return path === "/"
  return path === target || path.startsWith(`${target}/`)
}

const BASE = "flex h-9 w-full items-center gap-3 rounded-full text-[14px] transition-colors"
const IDLE = "font-medium text-ink-secondary hover:bg-subtle"
const ACTIVE = "bg-brand-tint font-semibold text-brand-text"

function Label({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const Icon = item.icon
  return (
    <>
      <Icon aria-hidden className="h-[18px] w-[18px] shrink-0" />
      <span className={collapsed ? "sr-only" : "min-w-0 flex-1 truncate text-left"}>{item.label}</span>
    </>
  )
}

/** Runs the item's `useBadge` hook in its own component, so an item whose hook comes and goes remounts instead of breaking hook order. */
function Count({ use }: { use: () => number | undefined }) {
  const count = use()
  if (!count) return null
  return <span className="rounded-full border border-line bg-surface px-2 text-[11px] font-semibold text-ink-secondary">{count}</span>
}

function Action({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const onSelect = item.useOnSelect?.()
  return (
    <button type="button" title={item.label} onClick={onSelect} className={`${BASE} ${IDLE} ${collapsed ? "justify-center" : "px-3"}`}>
      <Label item={item} collapsed={collapsed} />
    </button>
  )
}

/** One sidebar entry: a link (with optional count pill) or, for `useOnSelect` items, a button. */
export function NavLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const { pathname } = useLocation()
  if (item.useOnSelect) return <Action item={item} collapsed={collapsed} />
  if (!item.to) return null
  const active = isActivePath(pathname, item.to)
  return (
    <Link
      to={item.to}
      title={item.label}
      aria-current={active ? "page" : undefined}
      className={`${BASE} ${active ? ACTIVE : IDLE} ${collapsed ? "justify-center" : "px-3"}`}
    >
      <Label item={item} collapsed={collapsed} />
      {!collapsed && item.useBadge && <Count key="badge" use={item.useBadge} />}
    </Link>
  )
}

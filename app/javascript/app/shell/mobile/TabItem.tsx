import { Link, useLocation } from "react-router-dom"
import { useAgent } from "@/app/agent"
import type { NavItem } from "../../feature"

/** `/` matches only itself; every other target also matches its nested routes (`/channels/Facebook`). Case-insensitive, like the router. */
export function isActivePath(pathname: string, to: string): boolean {
  const path = pathname.toLowerCase()
  const target = to.toLowerCase()
  if (target === "/") return path === "/"
  return path === target || path.startsWith(`${target}/`)
}

const TAB = "relative flex h-[58px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium"

/** Runs the item's `useBadge` hook in its own component, so an item whose hook comes and goes remounts (and cleans up) instead of breaking hook order. */
function Count({ use }: { use: () => number | undefined }) {
  const count = use()
  if (!count) return null
  return (
    <span
      aria-hidden
      className="absolute -right-2.5 -top-1.5 min-w-[16px] rounded-full bg-brand px-1 text-center text-[10px] font-semibold leading-4 text-white"
    >
      {count > 99 ? "99+" : count}
    </span>
  )
}

function Face({ item, label, active }: { item: NavItem; label: string; active: boolean }) {
  const Icon = item.icon
  return (
    <>
      <span className="relative">
        <Icon aria-hidden className="h-[22px] w-[22px]" strokeWidth={active ? 2.2 : 1.8} />
        {item.useBadge && <Count key="badge" use={item.useBadge} />}
      </span>
      <span className="max-w-full truncate whitespace-nowrap px-0.5">{label}</span>
    </>
  )
}

const tone = (active: boolean) => (active ? "text-brand" : "text-ink-muted")

function LinkTab({ item, label }: { item: NavItem; label: string }) {
  const { pathname } = useLocation()
  const active = isActivePath(pathname, item.to ?? "")
  return (
    <Link to={item.to ?? "/"} aria-current={active ? "page" : undefined} className={`${TAB} ${tone(active)}`}>
      <Face item={item} label={label} active={active} />
    </Link>
  )
}

function ActionTab({ item, label }: { item: NavItem; label: string }) {
  const onSelect = item.useOnSelect?.()
  const agent = useAgent()
  // An action is "on" only while the overlay it opens is open (today: the agent behind the Ask tab).
  const active = item.id === "ask" && agent.isOpen
  return (
    <button type="button" onClick={onSelect} className={`${TAB} ${tone(active)}`}>
      <Face item={item} label={label} active={active} />
    </button>
  )
}

/** One tab: a link (with an optional count badge) or, for `useOnSelect` items, a button. */
export function TabItem({ item }: { item: NavItem }) {
  const label = item.mobile?.tab?.label ?? item.label
  if (item.useOnSelect) return <ActionTab item={item} label={label} />
  if (!item.to) return null
  return <LinkTab item={item} label={label} />
}

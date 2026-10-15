import { Link, useLocation } from "react-router-dom"
import { useAgent } from "@/app/agent"
import type { NavItem } from "../../feature"

/** `/` matches only itself; every other target also matches its nested routes (`/channels/Facebook`). */
export function isActivePath(pathname: string, to: string): boolean {
  if (to === "/") return pathname === "/"
  return pathname === to || pathname.startsWith(`${to}/`)
}

const TAB = "relative flex h-[58px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium"

function Face({ Icon, label, active, badge }: { Icon: NavItem["icon"]; label: string; active: boolean; badge?: number }) {
  return (
    <>
      <span className="relative">
        <Icon aria-hidden className="h-[22px] w-[22px]" strokeWidth={active ? 2.2 : 1.8} />
        {badge ? (
          <span className="absolute -right-2.5 -top-1.5 min-w-[16px] rounded-full bg-brand px-1 text-center text-[10px] font-semibold leading-4 text-white">
            {badge}
          </span>
        ) : null}
      </span>
      <span>{label}</span>
    </>
  )
}

const tone = (active: boolean) => (active ? "text-brand" : "text-ink-muted")

function LinkTab({ item, label }: { item: NavItem; label: string }) {
  const { pathname } = useLocation()
  const badge = item.useBadge?.() // stable per item: a registry item either always or never has the hook
  const active = isActivePath(pathname, item.to ?? "")
  return (
    <Link to={item.to ?? "/"} aria-current={active ? "page" : undefined} className={`${TAB} ${tone(active)}`}>
      <Face Icon={item.icon} label={label} active={active} badge={badge} />
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
      <Face Icon={item.icon} label={label} active={active} />
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

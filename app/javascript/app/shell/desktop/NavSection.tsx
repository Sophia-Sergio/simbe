import type { NavItem } from "../../feature"
import { NavLink } from "./NavLink"

export type NavSectionKey = NavItem["section"]

export const SECTION_ORDER: { key: NavSectionKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "insights", label: "Insights" },
  { key: "operations", label: "Operations" },
  { key: "agency", label: "Agency" },
]

export function NavSection({ label, items, collapsed }: { label: string; items: NavItem[]; collapsed: boolean }) {
  const id = `nav-${label.toLowerCase()}`
  return (
    <div role="group" aria-labelledby={id} className="flex flex-col gap-0.5">
      <h2
        id={id}
        className={collapsed ? "sr-only" : "px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-faint"}
      >
        {label}
      </h2>
      {items.map((item) => (
        <NavLink key={item.id} item={item} collapsed={collapsed} />
      ))}
    </div>
  )
}

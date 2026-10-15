import { BarChart3, Database, Filter, Home, KanbanSquare, Plug, Settings, Sparkles, Sun, UserCheck, Users } from "lucide-react"
import type { NavItem } from "../../feature"

/** Counts calls to the Ask action tab so tests can assert it acts instead of navigating. */
export const askCalls = { count: 0 }

const ask: NavItem = {
  id: "ask",
  label: "Ask",
  icon: Sparkles,
  section: "insights",
  roles: ["owner", "coordinator"],
  order: 90,
  desktop: false,
  useOnSelect: () => () => {
    askCalls.count += 1
  },
  mobile: { tab: { order: 4 } },
}

/** Nav sets for tests, shaped like what `registry.nav(role)` returns. */
export const OWNER_NAV: NavItem[] = [
  { id: "week", label: "This week", icon: Home, section: "insights", roles: ["owner"], order: 10, to: "/", mobile: { tab: { order: 1, label: "Home" } } },
  { id: "funnel", label: "Funnel", icon: Filter, section: "insights", roles: ["owner"], order: 20, to: "/funnel", mobile: { more: { order: 1 } } },
  { id: "channels", label: "Channels", icon: BarChart3, section: "insights", roles: ["owner"], order: 30, to: "/channels", mobile: { tab: { order: 3 } } },
  {
    id: "pipeline",
    label: "Pipeline",
    icon: KanbanSquare,
    section: "operations",
    roles: ["owner"],
    order: 40,
    to: "/pipeline",
    useBadge: () => 10,
    mobile: { tab: { order: 2 } },
  },
  { id: "coordinators", label: "Coordinators", icon: UserCheck, section: "operations", roles: ["owner"], order: 50, to: "/coordinators", mobile: { more: { order: 2 } } },
  { id: "sources", label: "Data sources", icon: Database, section: "agency", roles: ["owner"], order: 60, to: "/data-sources", mobile: { more: { order: 3 } } },
  { id: "claude", label: "Connect Claude", icon: Plug, section: "agency", roles: ["owner"], order: 70, to: "/connect-claude", mobile: { more: { order: 4 } } },
  { id: "settings", label: "Settings", icon: Settings, section: "agency", roles: ["owner"], order: 80, to: "/settings", mobile: { more: { order: 5 } } },
  ask,
]

export const COORDINATOR_NAV: NavItem[] = [
  {
    id: "next-actions",
    label: "Next actions",
    icon: Sun,
    section: "today",
    roles: ["coordinator"],
    order: 10,
    to: "/next-actions",
    useBadge: () => 4,
    mobile: { tab: { order: 1 } },
  },
  { id: "my-leads", label: "My leads", icon: Users, section: "today", roles: ["coordinator"], order: 20, to: "/pipeline", mobile: { tab: { order: 2 } } },
  ask,
]

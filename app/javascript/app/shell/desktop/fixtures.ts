import { BarChart3, Filter, Home, KanbanSquare, Settings, Sparkles, Sun, UserCheck, Users, Database, Plug } from "lucide-react"
import type { NavItem } from "../../feature"

/** Nav sets for tests, shaped like what `registry.nav(role)` returns. */
export const OWNER_NAV: NavItem[] = [
  { id: "week", label: "This week", icon: Home, section: "insights", roles: ["owner"], order: 10, to: "/" },
  { id: "funnel", label: "Funnel", icon: Filter, section: "insights", roles: ["owner"], order: 20, to: "/funnel" },
  { id: "channels", label: "Channels", icon: BarChart3, section: "insights", roles: ["owner"], order: 30, to: "/channels" },
  {
    id: "pipeline",
    label: "Pipeline",
    icon: KanbanSquare,
    section: "operations",
    roles: ["owner"],
    order: 40,
    to: "/pipeline",
    useBadge: () => 10,
  },
  { id: "coordinators", label: "Coordinators", icon: UserCheck, section: "operations", roles: ["owner"], order: 50, to: "/coordinators" },
  { id: "sources", label: "Data sources", icon: Database, section: "agency", roles: ["owner"], order: 60, to: "/data-sources" },
  { id: "claude", label: "Connect Claude", icon: Plug, section: "agency", roles: ["owner"], order: 70, to: "/connect-claude" },
  { id: "settings", label: "Settings", icon: Settings, section: "agency", roles: ["owner"], order: 80, to: "/settings" },
  // Mobile-only tab: the desktop sidebar must skip it.
  {
    id: "ask",
    label: "Ask",
    icon: Sparkles,
    section: "insights",
    roles: ["owner"],
    order: 90,
    desktop: false,
    useOnSelect: () => () => {},
  },
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
  },
  { id: "my-leads", label: "My leads", icon: Users, section: "today", roles: ["coordinator"], order: 20, to: "/pipeline" },
]

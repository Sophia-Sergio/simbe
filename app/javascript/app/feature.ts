import type { LucideIcon } from "lucide-react"
import type { ComponentType, ReactNode } from "react"
import type { RouteObject } from "react-router-dom"

export type Role = "owner" | "coordinator"

export type NavItem = {
  id: string
  label: string
  icon: LucideIcon
  section: "insights" | "operations" | "agency" | "today"
  roles: Role[]
  order: number
  to?: string // link target
  desktop?: boolean // default true; false hides the item from the desktop sidebar (e.g. the mobile-only Ask tab)
  useOnSelect?: () => () => void // action item (e.g. Ask opens the agent): a hook returning a handler
  useBadge?: () => number | undefined // count pill (Pipeline action_needed, Next actions open)
  mobile?: { tab?: { order: number; label?: string }; more?: { order: number } }
}

// A lane adds its screens by exporting `feature` from app/javascript/features/<lane>/feature.ts; no other file changes.
export type FeatureModule = {
  id: string
  routes?: RouteObject[] // children of the authenticated layout; guard with handle: { roles }
  publicRoutes?: RouteObject[] // sign-in, sign-up, accept-invite
  nav?: NavItem[]
  overlays?: { id: string; component: ComponentType }[] // mounted once inside AppShell
  providers?: { id: string; order: number; component: ComponentType<{ children: ReactNode }> }[]
  fab?: ComponentType // desktop floating button
  topBarRight?: ComponentType[] // e.g. snapshot pill
}

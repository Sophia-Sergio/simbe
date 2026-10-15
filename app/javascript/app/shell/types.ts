import type { ReactNode } from "react"
import type { Agency, User } from "@/api/types"
import type { NavItem } from "../feature"
import type { buildRegistry } from "../registry"

export type Registry = ReturnType<typeof buildRegistry>

/** What AppShell hands to whichever shell (desktop or mobile) is active. */
export type ShellProps = {
  user: User
  agency: Agency
  nav: NavItem[]
  title: string
  overlays: ReactNode
  fab: ReactNode
  topBarRight: ReactNode
  onSignOut: () => void
  children: ReactNode
}

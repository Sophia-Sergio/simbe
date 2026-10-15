import type { ReactNode } from "react"
import { Navigate } from "react-router-dom"
import type { Role } from "@/api/types"
import { useAuth } from "./auth/useAuth"

/**
 * Role gate for a route: a signed-in user with the wrong role is sent home (coordinator →
 * /next-actions, owner → /). Cosmetic gating only — the API enforces roles server-side.
 */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { role } = useAuth()
  if (role && !roles.includes(role)) {
    return <Navigate to={role === "coordinator" ? "/next-actions" : "/"} replace />
  }
  return <>{children}</>
}

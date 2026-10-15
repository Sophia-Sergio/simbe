import type { ReactNode } from "react"
import { Navigate, useLocation } from "react-router-dom"
import { Skeleton } from "@/components/ui/Skeleton"
import { useAuth } from "./auth/useAuth"

/**
 * Gate for the authenticated layout: a full-screen skeleton while the session resolves, and a
 * single replace-redirect to /signin (with the attempted path in ?next) when anonymous.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status, signedOut } = useAuth()
  const location = useLocation()

  if (status === "loading") return <Skeleton className="h-screen w-full" />
  if (status === "anonymous") {
    // A deliberate sign-out lands on a bare /signin: there is no page to come back to.
    if (signedOut) return <Navigate to="/signin" replace />
    return <Navigate to={`/signin?next=${encodeURIComponent(location.pathname)}`} replace />
  }
  return <>{children}</>
}

import type { ReactNode } from "react"
import { Navigate, useLocation } from "react-router-dom"
import { Skeleton } from "@/components/ui/Skeleton"
import { useAuth } from "./auth/useAuth"

/**
 * Gate for the authenticated layout: a full-screen skeleton while the session resolves, and a
 * single replace-redirect to /signin (with the attempted path in ?next) when anonymous.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  const location = useLocation()

  if (status === "loading") return <Skeleton className="h-screen w-full" />
  if (status === "anonymous") {
    return <Navigate to={`/signin?next=${encodeURIComponent(location.pathname)}`} replace />
  }
  return <>{children}</>
}

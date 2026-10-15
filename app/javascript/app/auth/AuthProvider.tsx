import { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { ApiError } from "@/api/client"
import { useMe, useSignIn, useSignOut } from "@/api/hooks/auth"
import type { Agency, Role, User } from "@/api/types"

export type AuthStatus = "loading" | "authenticated" | "anonymous"

export type Auth = {
  status: AuthStatus
  user: User | null
  agency: Agency | null
  role: Role | null
  /** True after a deliberate sign-out, until the next sign-in; RequireAuth then skips ?next. */
  signedOut: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<Auth | null>(null)

const isUnauthenticated = (error: unknown): boolean => error instanceof ApiError && error.status === 401

/**
 * Session state for the app. `useMe()` is the source of truth: 401 → anonymous, data →
 * authenticated. A 401 from ANY query while authenticated means the cookie expired mid-session:
 * the cache is dropped once and the app falls back to anonymous, so RequireAuth redirects a
 * single time. A successful sign-in clears the expired flag.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const me = useMe()
  const signInMutation = useSignIn()
  const signOutMutation = useSignOut()
  const [expired, setExpired] = useState(false)
  const [signedOut, setSignedOut] = useState(false)

  // Latest-mutation refs keep the signIn/signOut context identities stable across renders.
  const signInRef = useRef(signInMutation.mutateAsync)
  const signOutRef = useRef(signOutMutation.mutateAsync)
  useEffect(() => {
    signInRef.current = signInMutation.mutateAsync
    signOutRef.current = signOutMutation.mutateAsync
  })

  useEffect(() => {
    return queryClient.getQueryCache().subscribe((event) => {
      if (event.type === "updated" && event.action.type === "error" && isUnauthenticated(event.action.error)) {
        setExpired(true)
      }
    })
  }, [queryClient])

  // Drop every cached query once on expiry so no stale agency data lingers and errored queries
  // cannot refire while RequireAuth redirects.
  useEffect(() => {
    if (expired) queryClient.clear()
  }, [expired, queryClient])

  const signIn = useCallback(async (email: string, password: string) => {
    await signInRef.current({ email, password }) // seeds the ["me"] cache on success
    setExpired(false)
    setSignedOut(false)
  }, [])

  const signOut = useCallback(async () => {
    setSignedOut(true) // before the cache clears, so RequireAuth never sees anonymous without it
    try {
      await signOutRef.current() // clears the whole query cache onSettled, even on failure
    } catch {
      // Best effort: a dead session must still sign out locally.
    }
    setExpired(false)
  }, [])

  const data = me.data ?? null
  let status: AuthStatus = "anonymous"
  if (data && !expired) status = "authenticated"
  else if (!data && me.isPending && !expired && !signedOut) status = "loading"

  const value = useMemo<Auth>(
    () => ({
      status,
      user: status === "authenticated" && data ? data.user : null,
      agency: status === "authenticated" && data ? data.agency : null,
      role: status === "authenticated" && data ? data.user.role : null,
      signedOut,
      signIn,
      signOut,
    }),
    [status, data, signedOut, signIn, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

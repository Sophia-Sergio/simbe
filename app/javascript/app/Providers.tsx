import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useState } from "react"
import type { ReactNode } from "react"
import { ApiError } from "@/api/client"
import { ToastProvider } from "@/components/ui/Toast"
import { AuthProvider } from "./auth/AuthProvider"

/** Tests never retry (a failure must surface at once); the app retries a flaky request once. */
export function createQueryClient(): QueryClient {
  // A 401/403 is an answer, not a blip: retrying it only delays the redirect to sign-in by a second.
  const retry =
    import.meta.env.MODE === "test"
      ? false
      : (count: number, error: unknown) => !(error instanceof ApiError && (error.status === 401 || error.status === 403)) && count < 1
  return new QueryClient({ defaultOptions: { queries: { retry, staleTime: 30_000 }, mutations: { retry: false } } })
}

/**
 * Router-independent providers: QueryClient > Toast > Auth. The providers that need the router
 * (SearchPalette, then each feature's, ordered) are mounted by the router's root route in
 * router.tsx, because `useLeadPanel` reads the URL.
 */
export function Providers({ children, queryClient }: { children: ReactNode; queryClient?: QueryClient }) {
  const [fallback] = useState(createQueryClient)
  return (
    <QueryClientProvider client={queryClient ?? fallback}>
      <ToastProvider>
        <AuthProvider>{children}</AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  )
}

import { useQuery } from "@tanstack/react-query"
import { API, jsonRequest } from "../../api/client"
import type { NextActions } from "../../api/types"

/**
 * Open-task count for the "Next actions" nav badge.
 *
 * This lives in its own module and deliberately does **not** import `@/api/hooks/nextActions`:
 * `app/javascript/features/next-actions/feature.ts` is statically loaded by
 * `app/javascript/app/registry.test.ts` through a Vite server created with `configFile: false`,
 * where the `@` alias does not exist — anything feature.ts imports must resolve without it. The
 * page itself (lazily loaded, never touched by that spec) consumes the shared `useNextActions()`.
 *
 * It reuses the exact same query key, so the badge and the page share one cache entry and one
 * request (React Query dedupes identical keys) — no extra call, no second source of truth.
 */
export function useNextActionsBadge(): number | undefined {
  const { data } = useQuery({
    queryKey: ["next_actions", null],
    queryFn: ({ signal }) => jsonRequest<NextActions>("GET", `${API}/next_actions`, undefined, signal),
  })
  if (!data) return undefined
  return Math.max(0, data.progress.total - data.progress.done)
}

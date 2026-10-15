import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { API, jsonRequest } from "../client"
import type { Board, LeadDetail, LeadList } from "../types"

export type LeadListParams = { status?: string; coordinator?: string; q?: string }

export function useBoard(coordinator?: string) {
  return useQuery({
    queryKey: ["leads", "board", coordinator ?? null],
    queryFn: () =>
      jsonRequest<Board>("GET", coordinator ? `${API}/leads/board?coordinator=${encodeURIComponent(coordinator)}` : `${API}/leads/board`),
  })
}

function listPath(params: LeadListParams, cursor: string | null): string {
  const search = new URLSearchParams()
  if (params.status) search.set("status", params.status)
  if (params.coordinator) search.set("coordinator", params.coordinator)
  if (params.q) search.set("q", params.q)
  if (cursor) search.set("cursor", cursor)
  const query = search.toString()
  return `${API}/leads${query ? `?${query}` : ""}`
}

/** Paginated lead list; pages follow `next_cursor`. */
export function useLeadList(params: LeadListParams = {}) {
  return useInfiniteQuery({
    queryKey: ["leads", "list", params],
    queryFn: ({ pageParam }) => jsonRequest<LeadList>("GET", listPath(params, pageParam)),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor,
  })
}

/** Lead detail; disabled while the id is null (e.g. the slide-over is closed). */
export function useLead(id: string | null) {
  return useQuery({
    queryKey: ["leads", "detail", id],
    queryFn: () => jsonRequest<LeadDetail>("GET", `${API}/leads/${id}`),
    enabled: id !== null,
  })
}

/** ⌘K search: enabled from two characters, debounced 200 ms. */
export function useLeadSearch(q: string) {
  const enabled = q.length >= 2
  const [debounced, setDebounced] = useState(q)
  useEffect(() => {
    if (!enabled) return
    const timer = setTimeout(() => setDebounced(q), 200)
    return () => clearTimeout(timer)
  }, [q, enabled])
  const term = enabled ? debounced : q
  return useQuery({
    queryKey: ["leads", "search", term],
    queryFn: () => jsonRequest<LeadList>("GET", `${API}/leads?q=${encodeURIComponent(term)}`),
    enabled,
  })
}

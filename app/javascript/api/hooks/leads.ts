import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { API, jsonRequest } from "../client"
import type { Board, LeadDetail, LeadList } from "../types"

export type LeadListParams = { status?: string; coordinator?: string; q?: string }

export function useBoard(coordinator?: string) {
  return useQuery({
    queryKey: ["leads", "board", coordinator ?? null],
    queryFn: ({ signal }) =>
      jsonRequest<Board>("GET", coordinator ? `${API}/leads/board?coordinator=${encodeURIComponent(coordinator)}` : `${API}/leads/board`, undefined, signal),
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
    queryFn: ({ pageParam, signal }) => jsonRequest<LeadList>("GET", listPath(params, pageParam), undefined, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor,
  })
}

/** Lead detail; disabled while the id is null (e.g. the slide-over is closed). */
export function useLead(id: string | null) {
  return useQuery({
    queryKey: ["leads", "detail", id],
    queryFn: ({ signal }) => jsonRequest<LeadDetail>("GET", `${API}/leads/${id}`, undefined, signal),
    enabled: id !== null,
  })
}

/** ⌘K search: always debounced 200 ms, enabled from two characters (never an unfiltered request). */
export function useLeadSearch(q: string) {
  const [debounced, setDebounced] = useState("")
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(q), 200)
    return () => clearTimeout(timer)
  }, [q])
  return useQuery({
    queryKey: ["leads", "search", debounced],
    queryFn: ({ signal }) => jsonRequest<LeadList>("GET", `${API}/leads?q=${encodeURIComponent(debounced)}`, undefined, signal),
    enabled: debounced.length >= 2,
  })
}

import { useQuery } from "@tanstack/react-query"
import { API, jsonRequest } from "../client"
import type { ChannelDetail, Channels, Funnel, Range, Recommendation, Summary } from "../types"

const STALE_TIME = 60_000

export function useSummary(range: Range) {
  return useQuery({
    queryKey: ["metrics", "summary", range],
    queryFn: ({ signal }) => jsonRequest<Summary>("GET", `${API}/metrics/summary?range=${range}`, undefined, signal),
    staleTime: STALE_TIME,
  })
}

export function useFunnel(range: Range) {
  return useQuery({
    queryKey: ["metrics", "funnel", range],
    queryFn: ({ signal }) => jsonRequest<Funnel>("GET", `${API}/metrics/funnel?range=${range}`, undefined, signal),
    staleTime: STALE_TIME,
  })
}

export function useChannels(range: Range) {
  return useQuery({
    queryKey: ["metrics", "channels", range],
    queryFn: ({ signal }) => jsonRequest<Channels>("GET", `${API}/metrics/channels?range=${range}`, undefined, signal),
    staleTime: STALE_TIME,
  })
}

export function useChannel(channel: string, range: Range) {
  return useQuery({
    queryKey: ["metrics", "channel", channel, range],
    queryFn: ({ signal }) => jsonRequest<ChannelDetail>("GET", `${API}/metrics/channels/${encodeURIComponent(channel)}?range=${range}`, undefined, signal),
    staleTime: STALE_TIME,
  })
}

export function useRecommendations(range: Range) {
  return useQuery({
    queryKey: ["metrics", "recommendations", range],
    queryFn: ({ signal }) => jsonRequest<Recommendation[]>("GET", `${API}/recommendations?range=${range}`, undefined, signal),
    staleTime: STALE_TIME,
  })
}

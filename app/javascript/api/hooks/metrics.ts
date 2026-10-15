import { useQuery } from "@tanstack/react-query"
import { API, jsonRequest } from "../client"
import type { ChannelDetail, Channels, Funnel, Range, Recommendation, Summary } from "../types"

const STALE_TIME = 60_000

export function useSummary(range: Range) {
  return useQuery({
    queryKey: ["metrics", "summary", range],
    queryFn: () => jsonRequest<Summary>("GET", `${API}/metrics/summary?range=${range}`),
    staleTime: STALE_TIME,
  })
}

export function useFunnel(range: Range) {
  return useQuery({
    queryKey: ["metrics", "funnel", range],
    queryFn: () => jsonRequest<Funnel>("GET", `${API}/metrics/funnel?range=${range}`),
    staleTime: STALE_TIME,
  })
}

export function useChannels(range: Range) {
  return useQuery({
    queryKey: ["metrics", "channels", range],
    queryFn: () => jsonRequest<Channels>("GET", `${API}/metrics/channels?range=${range}`),
    staleTime: STALE_TIME,
  })
}

export function useChannel(channel: string, range: Range) {
  return useQuery({
    queryKey: ["metrics", "channel", channel, range],
    queryFn: () => jsonRequest<ChannelDetail>("GET", `${API}/metrics/channels/${encodeURIComponent(channel)}?range=${range}`),
    staleTime: STALE_TIME,
  })
}

export function useRecommendations(range: Range) {
  return useQuery({
    queryKey: ["metrics", "recommendations", range],
    queryFn: () => jsonRequest<Recommendation[]>("GET", `${API}/recommendations?range=${range}`),
    staleTime: STALE_TIME,
  })
}

import { useMutation, useQuery } from "@tanstack/react-query"
import { API, jsonRequest } from "../client"
import type { components } from "../generated/schema"

type McpSettings = components["schemas"]["McpSettings"]
type McpRotated = components["schemas"]["McpRotated"]

export function useMcpSettings() {
  return useQuery({ queryKey: ["mcp"], queryFn: () => jsonRequest<McpSettings>("GET", `${API}/mcp`) })
}

/** Rotates the key; the returned full key is shown once and never stored client-side. */
export function useRotateMcpKey() {
  return useMutation({ mutationFn: () => jsonRequest<McpRotated>("POST", `${API}/mcp/rotate`) })
}

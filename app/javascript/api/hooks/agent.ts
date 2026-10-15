import { useMutation, useQuery } from "@tanstack/react-query"
import { API, jsonRequest } from "../client"
import type { components } from "../generated/schema"

type Suggestions = components["schemas"]["Suggestions"]
type SendMessageResponse = components["schemas"]["SendMessageResponse"]

export function useAgentSuggestions() {
  return useQuery({ queryKey: ["agent", "suggestions"], queryFn: () => jsonRequest<Suggestions>("GET", `${API}/agent/suggestions`) })
}

export function useSendAgentMessage() {
  return useMutation({
    mutationFn: ({ conversationId, text }: { conversationId?: string; text: string }) =>
      jsonRequest<SendMessageResponse>("POST", `${API}/agent/messages`, { conversation_id: conversationId, text }),
  })
}

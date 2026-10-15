import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { API, jsonRequest } from "../client"
import { useToast } from "@/components/ui/Toast"
import type { NextActions, QueueKey } from "../types"

export function useNextActions(coordinator?: string) {
  return useQuery({
    queryKey: ["next_actions", coordinator ?? null],
    queryFn: () =>
      jsonRequest<NextActions>("GET", coordinator ? `${API}/next_actions?coordinator=${encodeURIComponent(coordinator)}` : `${API}/next_actions`),
  })
}

function applyDone(current: NextActions | undefined, leadId: string, queue: QueueKey, done: boolean): NextActions | undefined {
  if (!current) return current
  const queues = current.queues.map((entry) => {
    if (entry.key !== queue) return entry
    const items = entry.items.map((item) => (item.lead_id === leadId ? { ...item, done } : item))
    return { ...entry, count: items.filter((item) => !item.done).length, items }
  })
  const all = queues.flatMap((entry) => entry.items)
  return { ...current, progress: { done: all.filter((item) => item.done).length, total: all.length }, queues }
}

/** Optimistic done toggle: flips the item, adjusts the queue count and progress, rolls back + toasts on failure. */
export function useToggleDone() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const mutation = useMutation({
    mutationFn: ({ leadId, queue, done }: { leadId: string; queue: QueueKey; done: boolean }) =>
      jsonRequest<{ done: boolean }>(done ? "POST" : "DELETE", `${API}/next_actions/${leadId}/${queue}/completion`),
    onMutate: async ({ leadId, queue, done }) => {
      await queryClient.cancelQueries({ queryKey: ["next_actions"] })
      const previous = queryClient.getQueriesData<NextActions>({ queryKey: ["next_actions"] })
      queryClient.setQueriesData<NextActions>({ queryKey: ["next_actions"] }, (current) => applyDone(current, leadId, queue, done))
      return { previous }
    },
    onError: (_error, _variables, context) => {
      context?.previous.forEach(([key, value]) => queryClient.setQueryData(key, value))
      toast.show("Couldn't save — try again")
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["next_actions"] })
      void queryClient.invalidateQueries({ queryKey: ["leads", "detail"] })
    },
  })
  return { toggle: (leadId: string, queue: QueueKey, done: boolean) => mutation.mutate({ leadId, queue, done }) }
}

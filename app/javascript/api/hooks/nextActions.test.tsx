import { act, waitFor } from "@testing-library/react"
import nextActionsFixture from "@contracts/examples/next-actions/next-actions.json"
import type { NextActions } from "../types"
import { ApiError } from "../client"
import { mockApi } from "@/test/mockApi"
import { useToggleDone } from "./nextActions"
import { createQueryClient, renderHookWithQuery } from "./testUtils"

it("is optimistic and rolls back with a toast on failure", async () => {
  const client = createQueryClient()
  client.setQueryData(["next_actions", null], nextActionsFixture as NextActions)
  mockApi({
    "POST /api/v1/next_actions/aaaaaaaa-0000-4000-8000-000000000007/text_back_now/completion": () =>
      new Promise<Response>((resolve) => setTimeout(() => resolve(new Response("{}", { status: 500 })), 100)),
  })
  const { result } = renderHookWithQuery(() => useToggleDone(), { client })

  await act(async () => {
    result.current.toggle("aaaaaaaa-0000-4000-8000-000000000007", "text_back_now", true).catch(() => undefined)
  })
  await waitFor(() => expect(client.getQueryData<NextActions>(["next_actions", null])?.progress.done).toBe(1))

  await waitFor(() => expect(client.getQueryData<NextActions>(["next_actions", null])?.progress.done).toBe(0))
  expect(client.getQueryData<NextActions>(["next_actions", null])?.queues[0].count).toBe(1)
  expect(document.querySelector('[data-testid="toast"]')).toHaveTextContent("Couldn't save")
})

it("toggle returns the mutation promise so callers can await it", async () => {
  mockApi({
    "POST /api/v1/next_actions/aaaaaaaa-0000-4000-8000-000000000007/text_back_now/completion": () =>
      new Response(JSON.stringify({ error: { code: "not_found", message: "no" } }), { status: 404 }),
  })
  const { result } = renderHookWithQuery(() => useToggleDone())
  await expect(result.current.toggle("aaaaaaaa-0000-4000-8000-000000000007", "text_back_now", true)).rejects.toBeInstanceOf(ApiError)
})

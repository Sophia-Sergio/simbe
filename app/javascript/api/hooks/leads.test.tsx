import { act, waitFor } from "@testing-library/react"
import listFixture from "@contracts/examples/leads/list.json"
import { mockApi } from "@/test/mockApi"
import { useBoard, useLead, useLeadList, useLeadSearch } from "./leads"
import { renderHookWithQuery } from "./testUtils"

it("useLead is disabled while the id is null", () => {
  const spy = vi.spyOn(globalThis, "fetch")
  const { result } = renderHookWithQuery(() => useLead(null))
  expect(result.current.fetchStatus).toBe("idle")
  expect(result.current.data).toBeUndefined()
  expect(spy).not.toHaveBeenCalled()
  spy.mockRestore()
})

it("useBoard loads the board", async () => {
  const { result } = renderHookWithQuery(() => useBoard())
  await waitFor(() => expect(result.current.data?.columns.action_needed.count).toBe(4))
})

it("useLeadList follows next_cursor into a second page", async () => {
  mockApi({
    "GET /api/v1/leads": (request: Request) => {
      const cursor = new URL(request.url).searchParams.get("cursor")
      const leads = cursor ? [listFixture.leads[1]] : [listFixture.leads[0]]
      return new Response(JSON.stringify({ leads, next_cursor: cursor ? null : "1" }), { headers: { "Content-Type": "application/json" } })
    },
  })
  const { result } = renderHookWithQuery(() => useLeadList())
  await waitFor(() => expect(result.current.data?.pages).toHaveLength(1))
  expect(result.current.data?.pages[0].next_cursor).toBe("1")

  await act(async () => {
    await result.current.fetchNextPage()
  })
  await waitFor(() => expect(result.current.data?.pages).toHaveLength(2))
  expect(result.current.data?.pages[1].leads.map((lead) => lead.name)).toEqual([listFixture.leads[1].name])
})

it("useLeadSearch debounces even a pre-filled query and never sends fewer than two characters", async () => {
  vi.useFakeTimers()
  const seen: string[] = []
  const original = globalThis.fetch
  const spy = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    seen.push(String(input))
    return original(input, init)
  })
  const { result, rerender } = renderHookWithQuery(({ q }: { q: string }) => useLeadSearch(q), { initialProps: { q: "L4" } })
  await act(async () => {})
  expect(seen.filter((url) => url.includes("/leads?q="))).toEqual([]) // still debouncing, not an immediate request

  await act(async () => {
    await vi.advanceTimersByTimeAsync(250)
  })
  await act(async () => {})
  expect(seen.some((url) => url.includes("q=L4"))).toBe(true)

  rerender({ q: "L" })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(250)
  })
  await act(async () => {})
  expect(result.current.fetchStatus).toBe("idle")

  vi.useRealTimers()
  spy.mockRestore()
})

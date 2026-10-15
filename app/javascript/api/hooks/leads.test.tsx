import { act, waitFor } from "@testing-library/react"
import { useBoard, useLead, useLeadSearch } from "./leads"
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

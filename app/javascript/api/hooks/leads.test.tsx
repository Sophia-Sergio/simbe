import { waitFor } from "@testing-library/react"
import { useBoard, useLead } from "./leads"
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

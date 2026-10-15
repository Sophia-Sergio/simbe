import { act, renderHook } from "@testing-library/react"
import { useAsyncAction } from "./useAsyncAction"

it("useAsyncAction ignores re-entrant calls and resets after errors", async () => {
  let n = 0
  const fn = vi.fn(async () => {
    n++
    await Promise.resolve()
    if (n === 1) throw new Error("x")
    return "ok"
  })
  const { result } = renderHook(() => useAsyncAction(fn))

  let first!: Promise<unknown>
  act(() => {
    first = result.current.run()
    result.current.run()
  })
  expect(fn).toHaveBeenCalledTimes(1)
  expect(result.current.pending).toBe(true)

  await act(async () => {
    await first.catch(() => undefined)
  })
  expect(result.current.pending).toBe(false)

  await act(async () => {
    expect(await result.current.run()).toBe("ok")
  })
  expect(result.current.pending).toBe(false)
})

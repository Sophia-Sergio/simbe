import { renderHook } from "@testing-library/react"
import { useAgent } from "./agent"

it("default no-ops do not throw", () => {
  const { result } = renderHook(() => useAgent())
  expect(result.current.isOpen).toBe(false)
  expect(() => {
    result.current.open("why?")
    result.current.close()
  }).not.toThrow()
})

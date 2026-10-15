import { waitFor } from "@testing-library/react"
import { useCoordinator } from "./coordinators"
import { renderHookWithQuery } from "./testUtils"

it("encodes spaces in the coordinator name", async () => {
  const original = globalThis.fetch
  const spy = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => original(input, init))
  const { result } = renderHookWithQuery(() => useCoordinator("Dana Ortiz"))
  await waitFor(() => expect(result.current.data?.name).toBe("Dana Ortiz"))
  expect(spy.mock.calls.some(([input]) => String(input).includes("/api/v1/coordinators/Dana%20Ortiz"))).toBe(true)
  spy.mockRestore()
})

import { act, renderHook } from "@testing-library/react"
import { restoreMatchMedia, setViewport } from "@/components/ui/test-utils"
import { useIsDesktop } from "./useIsDesktop"
import { useMediaQuery } from "./useMediaQuery"

afterEach(() => restoreMatchMedia())

it("useIsDesktop tracks matchMedia", () => {
  setViewport(500)
  const { result } = renderHook(() => useIsDesktop())
  expect(result.current).toBe(false)

  act(() => setViewport(1280))
  expect(result.current).toBe(true)

  act(() => setViewport(390))
  expect(result.current).toBe(false)
})

it("useMediaQuery reflects the queried media string", () => {
  setViewport(1280)
  const { result } = renderHook(() => useMediaQuery("(min-width: 860px)"))
  expect(result.current).toBe(true)
})

import { act, renderHook } from "@testing-library/react"
import { useIsDesktop } from "./useIsDesktop"
import { useMediaQuery } from "./useMediaQuery"

function setViewport(width: number): void {
  window.matchMedia = ((query: string) => ({
    matches: /min-width:\s*860px/.test(query) ? width >= 860 : false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => true,
  })) as unknown as typeof window.matchMedia
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: width })
  window.dispatchEvent(new Event("resize"))
}

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

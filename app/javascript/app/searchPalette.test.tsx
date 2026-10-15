import { act, renderHook } from "@testing-library/react"
import { fireEvent } from "@testing-library/react"
import type { ReactNode } from "react"
import { MemoryRouter, useLocation } from "react-router-dom"
import { useLeadPanel } from "./leadPanel"
import { SearchPaletteProvider, useSearchPalette } from "./searchPalette"

function setup(route = "/pipeline?lead=a") {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[route]}>
      <SearchPaletteProvider>{children}</SearchPaletteProvider>
    </MemoryRouter>
  )
  return renderHook(() => ({ palette: useSearchPalette(), panel: useLeadPanel(), location: useLocation() }), { wrapper })
}

it("Ctrl+K and Cmd+K toggle the palette", () => {
  const { result } = setup()
  expect(result.current.palette.isOpen).toBe(false)
  fireEvent.keyDown(window, { key: "k", ctrlKey: true })
  expect(result.current.palette.isOpen).toBe(true)
  fireEvent.keyDown(window, { key: "k", metaKey: true })
  expect(result.current.palette.isOpen).toBe(false)
})

it("a bare k does nothing", () => {
  const { result } = setup()
  fireEvent.keyDown(window, { key: "k" })
  expect(result.current.palette.isOpen).toBe(false)
})

it("open closes the lead panel so two overlays never show together", () => {
  const { result } = setup("/pipeline?range=90d&lead=a&tab=screener")
  expect(result.current.panel.leadId).toBe("a")
  act(() => result.current.palette.open())
  expect(result.current.palette.isOpen).toBe(true)
  expect(result.current.panel.leadId).toBeNull()
  expect(result.current.location.search).toBe("?range=90d")
})

it("close hides the palette", () => {
  const { result } = setup()
  act(() => result.current.palette.open())
  act(() => result.current.palette.close())
  expect(result.current.palette.isOpen).toBe(false)
})

it("throws outside the provider", () => {
  expect(() => renderHook(() => useSearchPalette(), { wrapper: MemoryRouter })).toThrow(/SearchPaletteProvider/)
})

it("ignores keydown events that carry no key (browser autofill)", () => {
  const { result } = setup()
  expect(() => fireEvent.keyDown(window, {})).not.toThrow()
  expect(result.current.palette.isOpen).toBe(false)
})

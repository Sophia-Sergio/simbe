import { act, renderHook } from "@testing-library/react"
import type { ReactNode } from "react"
import { MemoryRouter, useLocation } from "react-router-dom"
import { useLeadPanel } from "./leadPanel"

function setup(route: string) {
  const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
  return renderHook(() => ({ panel: useLeadPanel(), location: useLocation() }), { wrapper })
}
const search = (r: { current: { location: { search: string } } }) => r.current.location.search

it("open writes lead and tab to the URL", () => {
  const { result } = setup("/pipeline")
  act(() => result.current.panel.open("a", "screener"))
  expect(search(result)).toBe("?lead=a&tab=screener")
  expect(result.current.panel.leadId).toBe("a")
  expect(result.current.panel.tab).toBe("screener")
})

it("falls back to the summary tab for an invalid tab", () => {
  const { result } = setup("/pipeline?lead=a&tab=bogus")
  expect(result.current.panel.tab).toBe("summary")
  const missing = setup("/pipeline?lead=a")
  expect(missing.result.current.panel.tab).toBe("summary")
})

it("prev and next walk the registered ids and wrap around", () => {
  const { result } = setup("/pipeline?lead=b")
  act(() => result.current.panel.setIds(["a", "b", "c"]))
  expect(result.current.panel.hasPrev).toBe(true)
  expect(result.current.panel.hasNext).toBe(true)
  act(() => result.current.panel.next())
  expect(result.current.panel.leadId).toBe("c")
  act(() => result.current.panel.next())
  expect(result.current.panel.leadId).toBe("a")
  act(() => result.current.panel.prev())
  expect(result.current.panel.leadId).toBe("c")
})

it("close removes lead and tab but keeps other params", () => {
  const { result } = setup("/pipeline?range=90d&lead=a&tab=activity")
  act(() => result.current.panel.close())
  expect(search(result)).toBe("?range=90d")
  expect(result.current.panel.leadId).toBeNull()
})

it("open keeps other params", () => {
  const { result } = setup("/pipeline?range=90d")
  act(() => result.current.panel.open("a"))
  expect(new URLSearchParams(search(result)).get("range")).toBe("90d")
})

it("ids registered on one list are not used on another path", () => {
  const first = setup("/pipeline?lead=b")
  act(() => first.result.current.panel.setIds(["a", "b", "c"]))
  const other = setup("/leads?lead=b")
  expect(other.result.current.panel.hasPrev).toBe(false)
  expect(other.result.current.panel.hasNext).toBe(false)
  act(() => other.result.current.panel.next())
  expect(search(other.result)).toBe("?lead=b")
})

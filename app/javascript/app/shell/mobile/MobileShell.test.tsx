import { screen } from "@testing-library/react"
import { renderMobile } from "./renderMobile"

afterEach(() => vi.restoreAllMocks())

it("composes top bar, padded main and tab bar", () => {
  renderMobile()
  const main = screen.getByRole("main")
  expect(main).toHaveTextContent("page body")
  expect(main).toHaveClass("px-[14px]", "pt-[18px]", "pb-[110px]")
  expect(screen.getByRole("navigation", { name: "Tabs" })).toHaveClass("fixed", "bottom-0", "z-30")
  expect(document.querySelector("[data-shell]")).toHaveAttribute("data-shell", "mobile")
})

it("never renders the fab", () => {
  renderMobile({ fab: <button type="button">Ask Simbe</button> })
  expect(screen.queryByRole("button", { name: "Ask Simbe" })).toBeNull()
})

it("renders overlays once", () => {
  renderMobile()
  expect(screen.getAllByTestId("overlay")).toHaveLength(1)
})

it("scrolls to the top on route change", () => {
  const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {})
  const { navigate } = renderMobile({ route: "/pipeline" })
  scrollTo.mockClear()
  navigate("/funnel")
  expect(scrollTo).toHaveBeenCalledWith(0, 0)
})

it("title prop drives the top bar", () => {
  renderMobile({ title: "Pipeline" })
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Pipeline")
})

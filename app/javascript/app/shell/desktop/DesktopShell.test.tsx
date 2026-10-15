import { fireEvent, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderShell } from "./renderShell"

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

it("composes sidebar, top bar and children inside a max-width main", () => {
  renderShell()
  expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument()
  expect(screen.getByRole("button", { name: /Search candidates/ })).toBeInTheDocument()
  const main = screen.getByRole("main")
  expect(main).toHaveTextContent("page body")
  expect(main).toHaveClass("max-w-[1200px]")
  expect(document.querySelector("[data-shell]")).toHaveAttribute("data-shell", "desktop")
})

it("renders overlays once and the fab in the bottom-right slot", () => {
  renderShell({ fab: <button type="button">Ask Simbe</button> })
  expect(screen.getAllByTestId("overlay")).toHaveLength(1)
  expect(screen.getByRole("button", { name: "Ask Simbe" }).parentElement).toHaveClass("fixed", "bottom-6", "right-6")
})

it("remembers the collapsed sidebar", async () => {
  const first = renderShell()
  await userEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }))
  expect(localStorage.getItem("simbe.sidebar")).toBe("collapsed")
  first.unmount()
  renderShell()
  expect(screen.getByTestId("sidebar")).toHaveClass("w-16")
})

it("renders and toggles when storage throws", async () => {
  // Only the shell's own key is blocked; the mock db persists its session through the same storage.
  const getItem = Storage.prototype.getItem
  const setItem = Storage.prototype.setItem
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key: string) {
    if (key === "simbe.sidebar") throw new Error("blocked")
    return getItem.call(this, key)
  })
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key: string, value: string) {
    if (key === "simbe.sidebar") throw new Error("blocked")
    setItem.call(this, key, value)
  })
  renderShell()
  expect(screen.getByTestId("sidebar")).toHaveClass("w-56")
  await userEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }))
  expect(screen.getByTestId("sidebar")).toHaveClass("w-16")
})

it("has a skip link as the first focusable element that focuses main", async () => {
  renderShell()
  await userEvent.tab()
  const skip = screen.getByRole("link", { name: "Skip to content" })
  expect(skip).toHaveFocus()
  await userEvent.keyboard("{Enter}")
  expect(screen.getByRole("main")).toHaveFocus()
})

it("Ctrl+K and Cmd+K open the palette from the page body", () => {
  const { palette } = renderShell()
  fireEvent.keyDown(document.body, { key: "k", ctrlKey: true })
  expect(palette()).toHaveTextContent("open")
  fireEvent.keyDown(document.body, { key: "k", metaKey: true })
  expect(palette()).toHaveTextContent("closed")
  fireEvent.keyDown(document.body, { key: "k", metaKey: true })
  expect(palette()).toHaveTextContent("open")
})

it("lets the chord work while focus is in a text field (it types nothing)", async () => {
  const { palette } = renderShell({ fab: <input aria-label="scratch" /> })
  screen.getByLabelText("scratch").focus()
  fireEvent.keyDown(screen.getByLabelText("scratch"), { key: "k", ctrlKey: true })
  expect(palette()).toHaveTextContent("open")
})

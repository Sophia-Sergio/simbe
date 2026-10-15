import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Sheet } from "./Sheet"

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

it("is a 620px panel on desktop", () => {
  setViewport(1280)
  render(
    <Sheet open onClose={() => {}} title="Lead panel">
      x
    </Sheet>,
  )
  const dialog = screen.getByRole("dialog")
  expect(dialog).toHaveAttribute("data-variant", "panel")
  expect(dialog).toHaveClass("w-[620px]")
})

it("is full screen on mobile", () => {
  setViewport(390)
  render(
    <Sheet open onClose={() => {}} title="Lead panel">
      x
    </Sheet>,
  )
  const dialog = screen.getByRole("dialog")
  expect(dialog).toHaveClass("inset-0")
})

it("closes on Esc", async () => {
  const onClose = vi.fn()
  setViewport(1280)
  render(
    <Sheet open onClose={onClose} title="Lead panel">
      x
    </Sheet>,
  )
  await userEvent.keyboard("{Escape}")
  expect(onClose).toHaveBeenCalledTimes(1)
})

it("renders the custom header instead of the title when provided", () => {
  setViewport(1280)
  render(
    <Sheet open onClose={() => {}} header={<div>Custom header</div>}>
      x
    </Sheet>,
  )
  expect(screen.getByText("Custom header")).toBeInTheDocument()
})

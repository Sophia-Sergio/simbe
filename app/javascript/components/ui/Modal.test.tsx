import { useState } from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Modal } from "./Modal"

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

it("closes on Esc and scrim click exactly once each", async () => {
  const onClose = vi.fn()
  render(
    <>
      <button>opener</button>
      <Modal open onClose={onClose} title="T">
        body
      </Modal>
    </>,
  )
  expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true")

  await userEvent.keyboard("{Escape}")
  expect(onClose).toHaveBeenCalledTimes(1)

  await userEvent.click(screen.getByTestId("scrim"))
  expect(onClose).toHaveBeenCalledTimes(2)
})

it("is a bottom sheet under 860px", () => {
  setViewport(390)
  render(
    <Modal open onClose={() => {}} title="T">
      x
    </Modal>,
  )
  expect(screen.getByRole("dialog")).toHaveAttribute("data-variant", "sheet")
})

it("returns focus to the opener on close", async () => {
  function Host() {
    const [open, setOpen] = useState(false)
    return (
      <>
        <button onClick={() => setOpen(true)}>opener</button>
        <Modal open={open} onClose={() => setOpen(false)} title="T">
          x
        </Modal>
      </>
    )
  }
  render(<Host />)
  await userEvent.click(screen.getByRole("button", { name: "opener" }))
  expect(screen.getByRole("dialog")).toHaveFocus()

  await userEvent.keyboard("{Escape}")
  expect(screen.getByRole("button", { name: "opener" })).toHaveFocus()
})

it("traps focus: Tab from the last control wraps to the first", async () => {
  render(
    <Modal open onClose={() => {}} title="T">
      <button>first</button>
      <button>last</button>
    </Modal>,
  )
  expect(screen.getByRole("button", { name: "first" })).toHaveFocus()
  screen.getByRole("button", { name: "last" }).focus()
  await userEvent.tab()
  expect(screen.getByRole("button", { name: "first" })).toHaveFocus()
})

it("renders nothing when closed", () => {
  render(
    <Modal open={false} onClose={() => {}} title="T">
      x
    </Modal>,
  )
  expect(screen.queryByRole("dialog")).toBeNull()
})

import { useState } from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Sheet } from "./Sheet"
import { restoreMatchMedia, setViewport } from "./test-utils"

afterEach(() => restoreMatchMedia())

it("is a 620px panel on desktop that respects reduced motion", () => {
  setViewport(1280)
  render(
    <Sheet open onClose={() => {}} title="Lead panel">
      x
    </Sheet>,
  )
  const dialog = screen.getByRole("dialog")
  expect(dialog).toHaveAttribute("data-variant", "panel")
  expect(dialog).toHaveClass("w-[620px]", "motion-reduce:transition-none")
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

it("renders a Close button in the default header so a title-only sheet can be dismissed", async () => {
  const onClose = vi.fn()
  setViewport(390)
  render(
    <Sheet open onClose={onClose} title="Lead panel">
      x
    </Sheet>,
  )
  expect(screen.getByRole("heading", { name: "Lead panel" })).toBeInTheDocument()
  await userEvent.click(screen.getByRole("button", { name: "Close" }))
  expect(onClose).toHaveBeenCalledTimes(1)
})

it("does not add a Close button to a custom header", () => {
  render(
    <Sheet open onClose={() => {}} header={<div>Custom header</div>}>
      x
    </Sheet>,
  )
  expect(screen.getByText("Custom header")).toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "Close" })).toBeNull()
})

it("closes on Esc and on scrim click on desktop", async () => {
  const onClose = vi.fn()
  setViewport(1280)
  render(
    <Sheet open onClose={onClose} title="T">
      x
    </Sheet>,
  )
  await userEvent.click(screen.getByTestId("scrim"))
  expect(onClose).toHaveBeenCalledTimes(1)

  await userEvent.keyboard("{Escape}")
  expect(onClose).toHaveBeenCalledTimes(2)
})

it("moves focus in and returns it to the opener", async () => {
  function Host() {
    const [open, setOpen] = useState(false)
    return (
      <>
        <button onClick={() => setOpen(true)}>opener</button>
        <Sheet open={open} onClose={() => setOpen(false)} title="T">
          x
        </Sheet>
      </>
    )
  }
  render(<Host />)
  await userEvent.click(screen.getByRole("button", { name: "opener" }))
  expect(screen.getByRole("button", { name: "Close" })).toHaveFocus()

  await userEvent.keyboard("{Escape}")
  expect(screen.getByRole("button", { name: "opener" })).toHaveFocus()
})

it("traps focus inside the panel", async () => {
  render(
    <Sheet open onClose={() => {}} header={<div><button>first</button><button>last</button></div>}>
      x
    </Sheet>,
  )
  expect(screen.getByRole("button", { name: "first" })).toHaveFocus()
  screen.getByRole("button", { name: "last" }).focus()
  await userEvent.tab()
  expect(screen.getByRole("button", { name: "first" })).toHaveFocus()
})

it("does not call onClose again for Escape after it has closed", async () => {
  const onClose = vi.fn()
  function Host() {
    const [open, setOpen] = useState(true)
    return (
      <Sheet
        open={open}
        onClose={() => {
          onClose()
          setOpen(false)
        }}
        title="T"
      >
        x
      </Sheet>
    )
  }
  render(<Host />)
  await userEvent.keyboard("{Escape}")
  expect(onClose).toHaveBeenCalledTimes(1)

  await userEvent.keyboard("{Escape}")
  expect(onClose).toHaveBeenCalledTimes(1)
})

it("locks body scroll and hides #root while open, restoring both on close", async () => {
  const root = document.createElement("div")
  root.id = "root"
  document.body.append(root)

  function Host() {
    const [open, setOpen] = useState(false)
    return (
      <>
        <button onClick={() => setOpen(true)}>open</button>
        <Sheet open={open} onClose={() => setOpen(false)} title="T">
          x
        </Sheet>
      </>
    )
  }
  render(<Host />)
  await userEvent.click(screen.getByRole("button", { name: "open" }))
  expect(document.body.style.overflow).toBe("hidden")
  expect(root).toHaveAttribute("aria-hidden", "true")
  expect(root).toHaveAttribute("inert")

  await userEvent.click(screen.getByRole("button", { name: "Close" }))
  expect(document.body.style.overflow).toBe("")
  expect(root).not.toHaveAttribute("aria-hidden")

  root.remove()
})

it("renders nothing when closed", () => {
  render(
    <Sheet open={false} onClose={() => {}} title="T">
      x
    </Sheet>,
  )
  expect(screen.queryByRole("dialog")).toBeNull()
})

import { useState } from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Modal } from "./Modal"
import { restoreMatchMedia, setViewport } from "./test-utils"

afterEach(() => restoreMatchMedia())

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

it("is a bottom sheet under 860px with a capped, scrollable body", () => {
  setViewport(390)
  render(
    <Modal open onClose={() => {}} title="T">
      body
    </Modal>,
  )
  const dialog = screen.getByRole("dialog")
  expect(dialog).toHaveAttribute("data-variant", "sheet")
  expect(dialog).toHaveClass("flex-col", "max-h-[90dvh]", "rounded-sheet", "pb-[env(safe-area-inset-bottom)]")
  expect(screen.getByText("body")).toHaveClass("min-h-0", "flex-1", "overflow-y-auto")
})

it("caps its height and scrolls the body on desktop", () => {
  render(
    <Modal open onClose={() => {}} title="T">
      body
    </Modal>,
  )
  const dialog = screen.getByRole("dialog")
  expect(dialog).toHaveClass("flex-col", "max-h-[calc(100dvh-2rem)]", "rounded-modal")
  expect(screen.getByText("body")).toHaveClass("flex-1", "overflow-y-auto")
})

it("keeps the footer reachable and lets a caller style it", () => {
  render(
    <Modal
      open
      onClose={() => {}}
      title="T"
      footer={<button>Save</button>}
      footerClassName="flex-col-reverse md:flex-row"
    >
      body
    </Modal>,
  )
  const footer = screen.getByRole("button", { name: "Save" }).parentElement
  expect(footer).toHaveClass("border-t", "flex-col-reverse")
  expect(screen.getByText("body")).toHaveClass("overflow-y-auto")
})

it("labels an untitled dialog with aria-label", () => {
  render(
    <Modal open onClose={() => {}} ariaLabel="Search">
      x
    </Modal>,
  )
  expect(screen.getByRole("dialog", { name: "Search" })).toBeInTheDocument()
})

it("prefers aria-labelledby when a title is given", () => {
  render(
    <Modal open onClose={() => {}} title="Confirm">
      x
    </Modal>,
  )
  const dialog = screen.getByRole("dialog")
  expect(dialog).toHaveAttribute("aria-labelledby")
  expect(dialog).not.toHaveAttribute("aria-label")
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

it("locks body scroll and hides #root while open, restoring both on close", async () => {
  const root = document.createElement("div")
  root.id = "root"
  document.body.append(root)

  function Host() {
    const [open, setOpen] = useState(false)
    return (
      <>
        <button onClick={() => setOpen(true)}>open</button>
        <Modal open={open} onClose={() => setOpen(false)} title="T">
          x
        </Modal>
      </>
    )
  }
  render(<Host />)
  expect(document.body.style.overflow).toBe("")
  expect(root).not.toHaveAttribute("aria-hidden")

  await userEvent.click(screen.getByRole("button", { name: "open" }))
  expect(document.body.style.overflow).toBe("hidden")
  expect(root).toHaveAttribute("aria-hidden", "true")
  expect(root).toHaveAttribute("inert")

  await userEvent.keyboard("{Escape}")
  expect(document.body.style.overflow).toBe("")
  expect(root).not.toHaveAttribute("aria-hidden")
  expect(root).not.toHaveAttribute("inert")

  root.remove()
})

it("renders nothing when closed", () => {
  render(
    <Modal open={false} onClose={() => {}} title="T">
      x
    </Modal>,
  )
  expect(screen.queryByRole("dialog")).toBeNull()
})

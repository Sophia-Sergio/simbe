import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ConfirmInline } from "./ConfirmInline"

it("calls the right handlers", async () => {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  render(<ConfirmInline message="Remove this connection?" confirmLabel="Remove" onConfirm={onConfirm} onCancel={onCancel} />)

  expect(screen.getByText("Remove this connection?")).toBeInTheDocument()
  await userEvent.click(screen.getByRole("button", { name: "Remove" }))
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }))
  expect(onConfirm).toHaveBeenCalledTimes(1)
  expect(onCancel).toHaveBeenCalledTimes(1)
})

it("disables both buttons while pending", () => {
  render(<ConfirmInline message="Remove?" confirmLabel="Remove" pending onConfirm={() => {}} onCancel={() => {}} />)
  expect(screen.getByRole("button", { name: "Remove" })).toBeDisabled()
  expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled()
})

it("is an inline panel, never a dialog", () => {
  render(<ConfirmInline message="Remove?" onConfirm={() => {}} onCancel={() => {}} />)
  expect(screen.queryByRole("dialog")).toBeNull()
  expect(screen.getByRole("group")).toHaveClass("bg-warning-bg")
})

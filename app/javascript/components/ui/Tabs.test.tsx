import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Tabs } from "./Tabs"

const tabs = [
  { value: "summary", label: "Summary" },
  { value: "screener", label: "Screener" },
  { value: "activity", label: "Activity" },
]

it("exposes tab semantics and selects on click", async () => {
  const onChange = vi.fn()
  render(<Tabs aria-label="Lead detail" value="summary" onChange={onChange} tabs={tabs} />)
  expect(screen.getByRole("tablist", { name: "Lead detail" })).toBeInTheDocument()
  expect(screen.getByRole("tab", { name: "Summary" })).toHaveAttribute("aria-selected", "true")

  await userEvent.click(screen.getByRole("tab", { name: "Activity" }))
  expect(onChange).toHaveBeenCalledWith("activity")
})

it("moves the selection and the focus with arrow keys", () => {
  const onChange = vi.fn()
  const { rerender } = render(<Tabs aria-label="Lead detail" value="screener" onChange={onChange} tabs={tabs} />)

  const screener = screen.getByRole("tab", { name: "Screener" })
  screener.focus()
  fireEvent.keyDown(screener, { key: "ArrowRight" })
  expect(onChange).toHaveBeenLastCalledWith("activity")
  expect(screen.getByRole("tab", { name: "Activity" })).toHaveFocus()

  // Controlled: the parent owns `value`, so re-render with the new selection.
  rerender(<Tabs aria-label="Lead detail" value="activity" onChange={onChange} tabs={tabs} />)
  fireEvent.keyDown(screen.getByRole("tab", { name: "Activity" }), { key: "ArrowLeft" })
  expect(onChange).toHaveBeenLastCalledWith("screener")
  expect(screen.getByRole("tab", { name: "Screener" })).toHaveFocus()
})

it("falls back to the first tab when value matches no tab", () => {
  render(<Tabs aria-label="Lead detail" value="nope" onChange={() => {}} tabs={tabs} />)
  // With every tab at tabIndex -1 the tablist would be unreachable by keyboard.
  expect(screen.getByRole("tab", { name: "Summary" })).toHaveAttribute("tabindex", "0")
  expect(screen.getByRole("tab", { name: "Screener" })).toHaveAttribute("tabindex", "-1")
})

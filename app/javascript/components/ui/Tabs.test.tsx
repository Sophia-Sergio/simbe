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

it("moves the selection with arrow keys", () => {
  const onChange = vi.fn()
  render(<Tabs aria-label="Lead detail" value="screener" onChange={onChange} tabs={tabs} />)

  fireEvent.keyDown(screen.getByRole("tab", { name: "Screener" }), { key: "ArrowRight" })
  expect(onChange).toHaveBeenLastCalledWith("activity")

  fireEvent.keyDown(screen.getByRole("tab", { name: "Screener" }), { key: "ArrowLeft" })
  expect(onChange).toHaveBeenLastCalledWith("summary")
})

import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ColumnChips } from "./ColumnChips"

const columns = [
  { key: "action_needed", label: "Action needed", count: 4 },
  { key: "qualified", label: "Qualified", count: 3 },
]

it("renders one chip per column with its count and marks the selected one", () => {
  render(<ColumnChips columns={columns} value="qualified" onChange={() => {}} />)
  const group = screen.getByRole("group", { name: "Pipeline columns" })
  // The label and count must be separated in the accessible name ("Qualified, 3", not "Qualified3").
  const qualified = within(group).getByRole("button", { name: "Qualified, 3" })
  expect(qualified).toHaveAttribute("aria-pressed", "true")
  expect(within(group).getByRole("button", { name: "Action needed, 4" })).toBeInTheDocument()
})

it("reports the clicked column", async () => {
  const onChange = vi.fn()
  render(<ColumnChips columns={columns} value="action_needed" onChange={onChange} />)
  await userEvent.click(screen.getByRole("button", { name: "Qualified, 3" }))
  expect(onChange).toHaveBeenCalledWith("qualified")
})

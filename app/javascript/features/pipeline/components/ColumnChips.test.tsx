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
  const qualified = within(group).getByRole("button", { name: /Qualified/ })
  expect(qualified).toHaveAttribute("aria-pressed", "true")
  expect(qualified).toHaveTextContent("3")
  expect(within(group).getByRole("button", { name: /Action needed/ })).toHaveTextContent("4")
})

it("reports the clicked column", async () => {
  const onChange = vi.fn()
  render(<ColumnChips columns={columns} value="action_needed" onChange={onChange} />)
  await userEvent.click(screen.getByRole("button", { name: /Qualified/ }))
  expect(onChange).toHaveBeenCalledWith("qualified")
})

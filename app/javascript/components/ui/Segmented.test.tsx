import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Segmented } from "./Segmented"

const options = [
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "12m", label: "12 months" },
]

it("selects on click and exposes aria-pressed", async () => {
  const onChange = vi.fn()
  render(<Segmented aria-label="Range" value="30d" onChange={onChange} options={options} />)
  expect(screen.getByRole("button", { name: "30 days" })).toHaveAttribute("aria-pressed", "true")
  expect(screen.getByRole("button", { name: "12 months" })).toHaveAttribute("aria-pressed", "false")

  await userEvent.click(screen.getByRole("button", { name: "12 months" }))
  expect(onChange).toHaveBeenCalledWith("12m")
})

it("keeps three options on one line", () => {
  render(<Segmented aria-label="Range" value="30d" onChange={() => {}} options={options} />)
  for (const button of screen.getAllByRole("button")) {
    expect(button).toHaveClass("whitespace-nowrap")
  }
  expect(screen.getByRole("group", { name: "Range" })).toHaveClass("flex-nowrap")
})

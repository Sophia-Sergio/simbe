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

it("draws its focus ring inside the button so the scroll container cannot clip it", () => {
  render(<Segmented aria-label="Range" value="30d" onChange={() => {}} options={options} />)
  // The track scrolls when a narrow toolbar cannot fit it, and a normal outline (offset 2px) would be cut
  // off; the inset outline keeps the ring fully visible at every width.
  expect(screen.getByRole("group", { name: "Range" })).toHaveClass("overflow-x-auto", "max-w-full")
  for (const button of screen.getAllByRole("button")) {
    expect(button).toHaveClass("focus-visible:-outline-offset-2")
    expect(button).toHaveClass("min-h-11", "md:min-h-0", "min-w-11", "md:min-w-0")
  }
})

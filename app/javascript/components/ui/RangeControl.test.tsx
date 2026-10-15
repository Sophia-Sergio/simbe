import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { RangeControl } from "./RangeControl"

it("maps the 12 months button to the 12m range", async () => {
  const onChange = vi.fn()
  render(<RangeControl value="30d" onChange={onChange} />)
  await userEvent.click(screen.getByRole("button", { name: "12 months" }))
  expect(onChange).toHaveBeenCalledWith("12m")
})

it("marks the current range as pressed", () => {
  render(<RangeControl value="90d" onChange={() => {}} />)
  expect(screen.getByRole("button", { name: "90 days" })).toHaveAttribute("aria-pressed", "true")
  expect(screen.getByRole("button", { name: "30 days" })).toHaveAttribute("aria-pressed", "false")
})

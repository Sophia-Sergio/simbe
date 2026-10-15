import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { TimezoneChips } from "./TimezoneChips"

it("marks the selected zone and reports a new one", async () => {
  const onChange = vi.fn()
  render(<TimezoneChips value="America/Los_Angeles" onChange={onChange} />)
  expect(screen.getByRole("button", { name: "Pacific" })).toHaveAttribute("aria-pressed", "true")
  await userEvent.click(screen.getByRole("button", { name: "Central" }))
  expect(onChange).toHaveBeenCalledWith("America/Chicago")
})

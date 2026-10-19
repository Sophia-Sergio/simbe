import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { InfoTip } from "./InfoTip"

it("shows the explanation on hover and hides it on leave", async () => {
  render(<InfoTip label="About the rate">Qualified ÷ leads</InfoTip>)
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
  await userEvent.hover(screen.getByRole("button", { name: "About the rate" }))
  expect(screen.getByRole("tooltip")).toHaveTextContent("Qualified ÷ leads")
  await userEvent.unhover(screen.getByRole("button", { name: "About the rate" }))
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
})

it("opens on tap and closes on Escape", async () => {
  render(<InfoTip label="About the rate">Qualified ÷ leads</InfoTip>)
  const button = screen.getByRole("button", { name: "About the rate" })
  await userEvent.click(button)
  expect(button).toHaveAttribute("aria-expanded", "true")
  await userEvent.keyboard("{Escape}")
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
})

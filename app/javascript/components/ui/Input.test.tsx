import { render, screen } from "@testing-library/react"
import { Input } from "./Input"

it("renders a 40px rounded input", () => {
  render(<Input aria-label="Search" placeholder="Search" />)
  expect(screen.getByLabelText("Search")).toHaveClass("h-10", "rounded-input", "border-line")
})

it("marks itself invalid and switches the border", () => {
  render(<Input aria-label="Search" invalid />)
  const input = screen.getByLabelText("Search")
  expect(input).toHaveAttribute("aria-invalid", "true")
  expect(input).toHaveClass("border-danger")
})

it("can be disabled", () => {
  render(<Input aria-label="Search" disabled />)
  expect(screen.getByLabelText("Search")).toBeDisabled()
})

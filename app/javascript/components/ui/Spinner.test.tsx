import { render, screen } from "@testing-library/react"
import { Spinner } from "./Spinner"

it("is an accessible, animated status", () => {
  render(<Spinner size={24} />)
  const spinner = screen.getByRole("status", { name: "Loading" })
  expect(spinner).toHaveAttribute("width", "24")
  expect(spinner).toHaveClass("animate-spin")
})

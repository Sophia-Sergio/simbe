import { render, screen } from "@testing-library/react"
import { Spinner } from "./Spinner"

it("is a labeled, non-live image that respects reduced motion", () => {
  render(<Spinner size={24} />)
  const spinner = screen.getByRole("img", { name: "Loading" })
  expect(spinner).toHaveAttribute("width", "24")
  expect(spinner).toHaveClass("animate-spin", "motion-reduce:animate-none")
})

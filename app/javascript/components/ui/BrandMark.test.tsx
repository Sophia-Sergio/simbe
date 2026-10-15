import { render, screen } from "@testing-library/react"
import { BrandMark } from "./BrandMark"

it("uses the committed mark with alt text", () => {
  render(<BrandMark size={40} />)
  const mark = screen.getByAltText("Simbe")
  expect(mark).toHaveAttribute("src", "/brand/simbe-mark.png")
  expect(mark).toHaveAttribute("height", "40")
})

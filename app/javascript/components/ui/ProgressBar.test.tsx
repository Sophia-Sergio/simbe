import { render, screen } from "@testing-library/react"
import { ProgressBar } from "./ProgressBar"

it("colors segments by state", () => {
  render(<ProgressBar segments={["done", "done", "action", "todo", "todo", "todo"]} />)
  const segs = screen.getAllByTestId("segment")
  expect(segs.map((s) => s.dataset.state)).toEqual(["done", "done", "action", "todo", "todo", "todo"])
  expect(segs[2]).toHaveClass("bg-warning")
})

it("maps the remaining states to their colors", () => {
  render(<ProgressBar segments={["current", "closed", "todo", "done", "action", "todo"]} />)
  const segs = screen.getAllByTestId("segment")
  expect(segs[0]).toHaveClass("bg-success")
  expect(segs[1]).toHaveClass("bg-danger")
  expect(segs[2]).toHaveClass("bg-subtle")
})

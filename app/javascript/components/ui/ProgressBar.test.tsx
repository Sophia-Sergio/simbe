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

it("describes the stage progress for assistive tech", () => {
  render(<ProgressBar segments={["done", "done", "done", "action", "todo", "todo"]} />)
  expect(screen.getByRole("img", { name: "3 of 6 stages done, needs action" })).toBeInTheDocument()
})

it("counts the current stage as done and flags closed", () => {
  render(<ProgressBar segments={["done", "done", "current", "todo", "todo", "todo"]} />)
  expect(screen.getByRole("img", { name: "3 of 6 stages done" })).toBeInTheDocument()
  render(<ProgressBar segments={["done", "closed", "todo", "todo", "todo", "todo"]} />)
  expect(screen.getByRole("img", { name: "1 of 6 stages done, closed" })).toBeInTheDocument()
})

it("accepts an explicit label", () => {
  render(<ProgressBar segments={["todo", "todo", "todo", "todo", "todo", "todo"]} label="Application progress" />)
  expect(screen.getByRole("img", { name: "Application progress" })).toBeInTheDocument()
})

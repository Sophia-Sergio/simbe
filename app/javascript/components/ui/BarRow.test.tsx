import { render, screen } from "@testing-library/react"
import { BarRow } from "./BarRow"

it("renders label, value and clamps the fill width", () => {
  const { container } = render(<BarRow label="Facebook" value="$150" pct={60} tone="success" />)
  expect(screen.getByText("Facebook")).toBeInTheDocument()
  expect(screen.getByText("$150")).toBeInTheDocument()
  const fill = (container.querySelector(".h-2\\.5") as HTMLElement).firstElementChild as HTMLElement
  expect(fill).toHaveStyle({ width: "60%" })
  expect(fill).toHaveClass("bg-success")
})

it("does not divide by zero and keeps a title for long labels", () => {
  const { container } = render(<BarRow label="A very long channel name indeed" value="0" pct={0} />)
  expect(screen.getByText("A very long channel name indeed")).toHaveAttribute("title", "A very long channel name indeed")
  const fill = (container.querySelector(".h-2\\.5") as HTMLElement).firstElementChild as HTMLElement
  expect(fill).toHaveStyle({ width: "0%" })
  expect(fill).toHaveClass("bg-line-strong")
})

it("supports a warning tone (the highest form drop-off)", () => {
  const { container } = render(<BarRow label="Pregnancy history" value="1" pct={100} tone="warning" />)
  expect(container.querySelector(".bg-warning")).not.toBeNull()
})

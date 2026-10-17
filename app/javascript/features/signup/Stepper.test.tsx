import { render, screen } from "@testing-library/react"
import { Stepper } from "./Stepper"

it("marks completed steps with a check and keeps the labels for taller viewports", () => {
  const { container } = render(<Stepper step={3} />)

  expect(container.querySelectorAll("[data-status]")).toHaveLength(5)
  expect(container.querySelectorAll('[data-status="done"]')).toHaveLength(2)
  expect(container.querySelectorAll('[data-status="current"]')).toHaveLength(1)
  expect(container.querySelectorAll('[data-status="upcoming"]')).toHaveLength(2)
  expect(screen.getByText("Ad accounts")).toBeInTheDocument()
  expect(screen.getByText("Step 3 of 5")).toBeInTheDocument()
})

it("names every step for assistive tech, including the labels hidden on mobile", () => {
  const { container } = render(<Stepper step={3} />)

  // The list item itself carries the name, so the label is announced under 860px too.
  expect(screen.getByText("Account: done")).toBeInTheDocument()
  expect(screen.getByText("Agency: done")).toBeInTheDocument()
  expect(screen.getByText("Ad accounts: current")).toBeInTheDocument()
  expect(screen.getByText("Load data: upcoming")).toBeInTheDocument()
  expect(screen.getByText("Team: upcoming")).toBeInTheDocument()
  // …and the dots/visible labels are decorative, so nothing is announced twice.
  expect(container.querySelectorAll("li > span[aria-label]")).toHaveLength(0)
  expect(screen.getByText("Ad accounts")).toHaveAttribute("aria-hidden", "true")
})

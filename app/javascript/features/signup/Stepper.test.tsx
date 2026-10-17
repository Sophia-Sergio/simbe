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

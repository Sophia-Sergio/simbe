import { vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { render, screen } from "@testing-library/react"
import { Stepper } from "./Stepper"

it("marks completed steps with a check and keeps the labels for taller viewports", () => {
  const { container } = render(<Stepper step={3} />)

  expect(container.querySelectorAll("[data-status]")).toHaveLength(4)
  expect(container.querySelectorAll('[data-status="done"]')).toHaveLength(2)
  expect(container.querySelectorAll('[data-status="current"]')).toHaveLength(1)
  expect(container.querySelectorAll('[data-status="upcoming"]')).toHaveLength(1)
  expect(screen.getByText("Load data")).toBeInTheDocument()
  expect(screen.queryByText(/Step 3 of 4/)).not.toBeInTheDocument()
})

it("names every step for assistive tech, including the labels hidden on mobile", () => {
  const { container } = render(<Stepper step={3} />)

  // The list item itself carries the name, so the label is announced under 860px too.
  expect(screen.getByText("Account: done")).toBeInTheDocument()
  expect(screen.getByText("Agency: done")).toBeInTheDocument()
  expect(screen.getByText("Load data: current")).toBeInTheDocument()
  expect(screen.getByText("Team: upcoming")).toBeInTheDocument()
  // …and the dots/visible labels are decorative, so nothing is announced twice.
  expect(container.querySelectorAll("li > span[aria-label]")).toHaveLength(0)
  expect(screen.getByText("Load data")).toHaveAttribute("aria-hidden", "true")
})

it("makes only the steps from firstReachable on clickable, never the current one", async () => {
  const onGo = vi.fn()
  render(<Stepper step={4} firstReachable={3} onGo={onGo} />)

  expect(screen.queryByRole("button", { name: /^Account:/ })).not.toBeInTheDocument()
  expect(screen.queryByRole("button", { name: /^Agency:/ })).not.toBeInTheDocument()
  expect(screen.queryByRole("button", { name: /^Team:/ })).not.toBeInTheDocument()

  await userEvent.click(screen.getByRole("button", { name: "Load data: done" }))
  expect(onGo.mock.calls).toEqual([[3]])
})

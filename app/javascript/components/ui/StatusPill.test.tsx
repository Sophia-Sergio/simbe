import { render, screen } from "@testing-library/react"
import { StatusPill } from "./StatusPill"

it("maps each status tone onto the Pill classes", () => {
  render(<StatusPill status={{ key: "closed", label: "Closed", tone: "danger" }} />)
  expect(screen.getByText("Closed").parentElement).toHaveClass("bg-danger-bg", "text-danger-text")
})

it("renders neutral and success tones", () => {
  const { rerender } = render(<StatusPill status={{ key: "on_track", label: "On track", tone: "success" }} />)
  expect(screen.getByText("On track").parentElement).toHaveClass("bg-success-bg")
  rerender(<StatusPill status={{ key: "paused", label: "Paused", tone: "neutral" }} />)
  expect(screen.getByText("Paused").parentElement).toHaveClass("bg-subtle")
})

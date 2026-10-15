import { render, screen } from "@testing-library/react"
import { Pill } from "./Pill"

it("applies each tone's classes", () => {
  render(
    <>
      <Pill>Neutral</Pill>
      <Pill tone="success">OK</Pill>
      <Pill tone="warning">Careful</Pill>
      <Pill tone="danger">Bad</Pill>
      <Pill tone="violet">People</Pill>
      <Pill tone="brand">Brand</Pill>
      <Pill tone="outline">Outline</Pill>
    </>,
  )
  expect(screen.getByText("Neutral")).toHaveClass("bg-subtle", "text-ink-secondary", "border-line")
  expect(screen.getByText("OK")).toHaveClass("bg-success-bg", "text-success-text", "border-success-border")
  expect(screen.getByText("Careful")).toHaveClass("bg-warning-bg", "text-warning-text")
  expect(screen.getByText("Bad")).toHaveClass("bg-danger-bg", "text-danger-text")
  expect(screen.getByText("People")).toHaveClass("bg-violet-bg", "text-violet-text")
  expect(screen.getByText("Brand")).toHaveClass("bg-brand-tint", "text-brand-text")
  expect(screen.getByText("Outline")).toHaveClass("bg-transparent")
  expect(screen.getByText("Neutral")).toHaveClass("rounded-full", "text-[11px]")
})

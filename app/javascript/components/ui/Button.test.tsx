import { MemoryRouter } from "react-router-dom"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Button, LinkButton } from "./Button"

it("renders each variant with its brand classes", () => {
  render(
    <>
      <Button>Primary</Button>
      <Button variant="outline-brand">Outline</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="danger">Danger</Button>
    </>,
  )
  expect(screen.getByRole("button", { name: "Primary" })).toHaveClass("bg-brand", "rounded-full", "text-[14px]")
  expect(screen.getByRole("button", { name: "Outline" })).toHaveClass("border-brand-border", "text-brand-text")
  expect(screen.getByRole("button", { name: "Secondary" })).toHaveClass("bg-surface", "border-line", "text-ink")
  expect(screen.getByRole("button", { name: "Ghost" })).toHaveClass("text-ink-secondary")
  expect(screen.getByRole("button", { name: "Danger" })).toHaveClass("bg-danger-text", "text-white")
})

it("a pending button is busy, disabled, keeps its label and shows a spinner", async () => {
  const onClick = vi.fn()
  render(
    <Button pending onClick={onClick}>
      Save
    </Button>,
  )
  const button = screen.getByRole("button", { name: "Save" })
  expect(button).toBeDisabled()
  expect(button).toHaveAttribute("aria-busy", "true")
  expect(screen.getByTestId("spinner")).toBeInTheDocument()
  expect(button).toHaveTextContent("Save")

  await userEvent.click(button, { pointerEventsCheck: 0 })
  expect(onClick).not.toHaveBeenCalled()
})

it("renders a small button at 30px", () => {
  render(<Button size="sm">Small</Button>)
  expect(screen.getByRole("button", { name: "Small" })).toHaveClass("h-[30px]")
})

it("renders an icon-only button through its aria-label", () => {
  render(<Button aria-label="Ask Simbe">+</Button>)
  expect(screen.getByRole("button", { name: "Ask Simbe" })).toBeInTheDocument()
})

it("keeps the pending label in the accessibility tree", () => {
  render(<Button pending>Save</Button>)
  const label = screen.getByText("Save")
  // The accessible name must survive `pending`: a real browser drops labels hidden with
  // visibility:hidden, and jsdom would not catch that.
  expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument()
  expect(label).not.toHaveAttribute("aria-hidden")
  expect(label).not.toHaveAttribute("hidden")
  expect(label.className).toContain("opacity-0")
  expect(label.className).not.toContain("invisible")
  expect(label.className).not.toContain("sr-only")
})

it("LinkButton renders an anchor with an href", () => {
  render(
    <MemoryRouter>
      <LinkButton to="/pipeline">Pipeline</LinkButton>
    </MemoryRouter>,
  )
  expect(screen.getByRole("link", { name: "Pipeline" })).toHaveAttribute("href", "/pipeline")
})

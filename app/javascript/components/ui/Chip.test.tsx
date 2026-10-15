import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Chip } from "./Chip"

it("reports selection through aria-pressed and fires onClick", async () => {
  const onClick = vi.fn()
  const { rerender } = render(
    <Chip selected onClick={onClick}>
      Facebook
    </Chip>,
  )
  const chip = screen.getByRole("button", { name: "Facebook" })
  expect(chip).toHaveAttribute("aria-pressed", "true")
  expect(chip).toHaveClass("bg-brand-tint", "border-brand-border", "text-brand-text")

  await userEvent.click(chip)
  expect(onClick).toHaveBeenCalledTimes(1)

  rerender(<Chip onClick={onClick}>Facebook</Chip>)
  expect(screen.getByRole("button", { name: "Facebook" })).toHaveAttribute("aria-pressed", "false")
})

it("renders a leading node and can be disabled", () => {
  render(
    <Chip leading={<span data-testid="dot" />} disabled>
      Instagram
    </Chip>,
  )
  expect(screen.getByTestId("dot")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Instagram" })).toBeDisabled()
})

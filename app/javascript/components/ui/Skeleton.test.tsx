import { render, screen } from "@testing-library/react"
import { Skeleton } from "./Skeleton"

it("pulses with the token background", () => {
  render(<Skeleton className="h-4 w-20" />)
  const skeleton = screen.getByTestId("skeleton")
  expect(skeleton).toHaveClass("animate-pulse", "bg-subtle", "rounded-card", "h-4")
})

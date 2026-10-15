import { render, screen } from "@testing-library/react"
import { Skeleton } from "./Skeleton"

it("pulses with the token background and respects reduced motion", () => {
  render(<Skeleton className="h-4 w-20" />)
  const skeleton = screen.getByTestId("skeleton")
  expect(skeleton).toHaveClass("animate-pulse", "motion-reduce:animate-none", "bg-subtle", "rounded-card", "h-4")
})

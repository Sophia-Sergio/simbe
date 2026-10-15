import { render, screen } from "@testing-library/react"
import { KpiCard } from "./KpiCard"

it("renders value, delta and note, and hides an empty delta", () => {
  const { rerender } = render(
    <KpiCard label="Leads" value="3,530" delta={{ text: "+6%", tone: "up" }} note="30 days" bar={{ kind: "fill", pct: 60 }} />,
  )
  expect(screen.getByText("3,530")).toHaveClass("text-[28px]")
  expect(screen.getByText("+6%")).toHaveClass("text-success-text")
  expect(screen.getByText("30 days")).toBeInTheDocument()

  rerender(<KpiCard label="X" value="—" delta={{ text: "", tone: "none" }} bar={{ kind: "fill", pct: 0 }} />)
  expect(screen.queryByText("+0%")).toBeNull()
})

it("colors a down delta amber and supports the small size", () => {
  render(<KpiCard label="Cost" value="$145" delta={{ text: "−0.3", tone: "down" }} bar={{ kind: "thirds", active: 2 }} size="sm" />)
  expect(screen.getByText("−0.3")).toHaveClass("text-warning-text")
  expect(screen.getByText("$145")).toHaveClass("text-[24px]")
})

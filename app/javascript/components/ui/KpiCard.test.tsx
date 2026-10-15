import { render, screen } from "@testing-library/react"
import { KpiCard } from "./KpiCard"

it("renders value, delta and note, and omits an empty delta", () => {
  const { rerender } = render(
    <KpiCard label="Leads" value="3,530" delta={{ text: "+6%", tone: "up" }} note="30 days" bar={{ kind: "fill", pct: 60 }} />,
  )
  expect(screen.getByText("3,530")).toHaveClass("text-[28px]")
  expect(screen.getByText("+6%")).toHaveClass("text-success-text")
  expect(screen.getByText("30 days")).toBeInTheDocument()
  expect(screen.getByTestId("kpi-delta")).toHaveTextContent("+6%")

  rerender(<KpiCard label="X" value="—" delta={{ text: "", tone: "none" }} bar={{ kind: "fill", pct: 0 }} />)
  expect(screen.queryByTestId("kpi-delta")).toBeNull()
})

it("uses the brand card radius (20px), not the panel radius", () => {
  const { container } = render(<KpiCard label="Leads" value="3,530" bar={{ kind: "fill", pct: 60 }} />)
  const root = container.firstElementChild as HTMLElement
  expect(root).toHaveClass("rounded-card")
  expect(root.className).not.toContain("rounded-panel")
})

it("colors a down delta amber and supports the small size", () => {
  render(<KpiCard label="Cost" value="$145" delta={{ text: "−0.3", tone: "down" }} bar={{ kind: "thirds", active: 2 }} size="sm" />)
  expect(screen.getByText("−0.3")).toHaveClass("text-warning-text")
  expect(screen.getByText("$145")).toHaveClass("text-[24px]")
})

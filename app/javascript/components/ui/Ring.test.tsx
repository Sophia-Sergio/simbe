import { render, screen } from "@testing-library/react"
import { Ring } from "./Ring"

it("prints the legend and rounds the met percentage", () => {
  render(<Ring met={7} review={1} notMet={1} unanswered={1} />)
  expect(screen.getByText("7 met · 1 red flags · 1 to review · 1 unanswered")).toBeInTheDocument()
  expect(screen.getByText("70%")).toBeInTheDocument()
  expect(screen.getByText("Progress")).toBeInTheDocument()
})

it("renders an empty state instead of NaN% when the total is zero", () => {
  render(<Ring met={0} review={0} notMet={0} unanswered={0} />)
  expect(screen.getByText("—")).toBeInTheDocument()
  expect(screen.queryByText(/NaN/)).toBeNull()
})

it("draws one segment per verdict with the right state", () => {
  render(<Ring met={1} review={2} notMet={3} unanswered={4} />)
  const segments = screen.getAllByTestId("ring-segment")
  expect(segments.map((s) => s.dataset.state)).toEqual(["met", "review", "notMet", "unanswered"])
})

it("sizes each arc segment with dasharray and a running offset", () => {
  const CIRCUMFERENCE = 2 * Math.PI * 36
  const quarter = (1 / 4) * CIRCUMFERENCE
  const { container } = render(<Ring met={1} review={1} notMet={1} unanswered={1} />)
  const segments = Array.from(container.querySelectorAll('[data-testid="ring-segment"]')) as SVGCircleElement[]
  for (const segment of segments) {
    expect(segment).toHaveAttribute("stroke-dasharray", `${quarter} ${CIRCUMFERENCE}`)
  }
  expect(segments[0]).toHaveAttribute("stroke-dashoffset", "0")
  expect(segments[1]).toHaveAttribute("stroke-dashoffset", `${-quarter}`)
  expect(segments[2]).toHaveAttribute("stroke-dashoffset", `${-2 * quarter}`)
  expect(segments[3]).toHaveAttribute("stroke-dashoffset", `${-3 * quarter}`)
})

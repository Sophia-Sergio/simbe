import { render } from "@testing-library/react"
import { SegmentBar } from "./SegmentBar"

function segments(container: HTMLElement): HTMLElement[] {
  return Array.from((container.firstElementChild as HTMLElement).children) as HTMLElement[]
}

it("fill renders the pct as a width and defaults to success", () => {
  const { container } = render(<SegmentBar kind="fill" pct={60} />)
  const fill = segments(container)[0]
  expect(fill).toHaveStyle({ width: "60%" })
  expect(fill).toHaveClass("bg-success")
})

it("fill clamps outside 0–100 and never divides by zero", () => {
  const high = render(<SegmentBar kind="fill" pct={150} />)
  expect(segments(high.container)[0]).toHaveStyle({ width: "100%" })
  const low = render(<SegmentBar kind="fill" pct={-5} />)
  expect(segments(low.container)[0]).toHaveStyle({ width: "0%" })
  const zero = render(<SegmentBar kind="fill" pct={0} tone="brand" />)
  expect(segments(zero.container)[0]).toHaveStyle({ width: "0%" })
})

it("thirds highlights the active segment and dims the others", () => {
  const { container } = render(<SegmentBar kind="thirds" active={1} />)
  const thirds = segments(container)
  expect(thirds).toHaveLength(3)
  expect(thirds[1]).toHaveClass("bg-warning", "opacity-100")
  expect(thirds[0]).toHaveClass("opacity-30")
  expect(thirds[2]).toHaveClass("opacity-30")
})

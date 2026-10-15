import { render, screen } from "@testing-library/react"
import { BarChart } from "./BarChart"

it("normalises bars to the largest value", () => {
  render(
    <BarChart
      title="Leads by channel"
      bars={[
        { label: "Facebook", value: 5, display: "5" },
        { label: "Google", value: 10, display: "10" },
      ]}
    />,
  )
  const bars = screen.getAllByTestId("bar")
  expect(bars[0]).toHaveStyle({ height: "50%" })
  expect(bars[1]).toHaveStyle({ height: "100%" })
})

it("does not divide by zero when every value is zero", () => {
  render(<BarChart title="Flat" bars={[{ label: "A", value: 0 }, { label: "B", value: 0 }]} />)
  for (const bar of screen.getAllByTestId("bar")) {
    expect(bar).toHaveStyle({ height: "0%" })
  }
  expect(screen.queryByText(/NaN/)).toBeNull()
})

it("exposes a text alternative that prints every bar", () => {
  render(<BarChart title="Funnel" bars={[{ label: "Inquiry", value: 3530, display: "3,530" }]} />)
  expect(screen.getByRole("img", { name: /Funnel: Inquiry 3,530/ })).toBeInTheDocument()
})

it("renders duplicate labels without a React key warning", () => {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {})
  render(<BarChart title="Dup" bars={[{ label: "Same", value: 1 }, { label: "Same", value: 2 }]} />)
  expect(spy.mock.calls.flat().join(" ")).not.toMatch(/same key/)
  spy.mockRestore()
})

it("clamps negative and NaN values and keeps a visible minimum", () => {
  render(
    <BarChart
      title="Odd"
      bars={[
        { label: "Negative", value: -5 },
        { label: "Missing", value: Number.NaN },
        { label: "Big", value: 100 },
        { label: "Tiny", value: 0.01 },
      ]}
    />,
  )
  const bars = screen.getAllByTestId("bar")
  expect(bars[0]).toHaveStyle({ height: "0%" })
  expect(bars[1]).toHaveStyle({ height: "0%" })
  expect(bars[2]).toHaveStyle({ height: "100%" })
  expect(bars[3]).toHaveStyle({ minHeight: "2px" })
  expect(screen.queryByText(/NaN/)).toBeNull()
})

import { render, screen } from "@testing-library/react"
import { AnswerChart } from "./AnswerChart"

it("renders one horizontal row per datum, each bar scaled to the largest value", () => {
  const { container } = render(
    <AnswerChart
      chart={{
        title: "Cost per qualified lead",
        bars: [
          { label: "Facebook", value: 150, display: "$150" },
          { label: "Google", value: 75, display: "$75" },
          { label: "TikTok", value: 30, display: "$30" },
        ],
      }}
    />,
  )
  expect(screen.getByText("Cost per qualified lead")).toBeInTheDocument()
  expect(screen.getByText("$150")).toBeInTheDocument()

  const fills = Array.from(container.querySelectorAll<HTMLElement>('[data-tone="brand"]'))
  expect(fills).toHaveLength(3)
  expect(fills[0]).toHaveStyle({ width: "100%" })
  expect(fills[1]).toHaveStyle({ width: "50%" })
  expect(fills[2]).toHaveStyle({ width: "20%" })
})

it("renders a single datum as one proportional full-width row, not a column that fills the panel", () => {
  const { container } = render(
    <AnswerChart chart={{ title: "One", bars: [{ label: "Only channel", value: 42, display: "42" }] }} />,
  )
  const fills = Array.from(container.querySelectorAll<HTMLElement>('[data-tone="brand"]'))
  expect(fills).toHaveLength(1)
  expect(fills[0]).toHaveStyle({ width: "100%" })
})

it("truncates a long label (keeps its title, min-w-0) and never divides by zero", () => {
  const long = "A very long channel name that would otherwise overflow the row"
  render(
    <AnswerChart
      chart={{
        title: "No data",
        bars: [
          { label: long, value: 0, display: "0" },
          { label: "Also zero", value: 0, display: "0" },
        ],
      }}
    />,
  )
  const label = screen.getByText(long)
  expect(label).toHaveAttribute("title", long)
  expect(label).toHaveClass("truncate", "min-w-0")
})

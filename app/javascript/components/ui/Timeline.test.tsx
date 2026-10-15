import { render, screen } from "@testing-library/react"
import { Timeline } from "./Timeline"

const items = [
  { at: "2026-09-01T10:00:00Z", title: "Application started", detail: "40% complete" },
  { at: "2026-10-01T10:00:00Z", title: "Consult booked", detail: "Oct 4, 2:00 pm" },
]

it("renders newest first with a brand dot on the newest entry", () => {
  render(<Timeline items={items} formatAt={(iso) => iso.slice(0, 10)} />)
  const titles = screen.getAllByText(/Application started|Consult booked/)
  expect(titles[0]).toHaveTextContent("Consult booked")
  const dots = screen.getAllByTestId("timeline-dot")
  expect(dots[0]).toHaveClass("bg-brand")
  expect(dots[1]).toHaveClass("bg-line-strong")
})

it("prints the time on the right and truncates long titles", () => {
  render(
    <Timeline
      items={[{ at: "2026-10-01T10:00:00Z", title: "A very long activity title that should be truncated with an ellipsis", detail: "detail" }]}
      formatAt={() => "9:14 am"}
    />,
  )
  expect(screen.getByText("9:14 am")).toBeInTheDocument()
  expect(screen.getByText(/A very long activity title/)).toHaveClass("truncate")
})

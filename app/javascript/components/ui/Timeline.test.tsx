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

it("puts entries with an invalid date last", () => {
  render(
    <Timeline
      items={[
        { at: "not-a-date", title: "Unknown time" },
        { at: "2026-10-01T10:00:00Z", title: "Consult booked" },
      ]}
      formatAt={(iso) => iso}
    />,
  )
  const items = screen.getAllByTestId("timeline-item")
  expect(items[0]).toHaveTextContent("Consult booked")
  expect(items[1]).toHaveTextContent("Unknown time")
})

it("exposes the timestamp as a <time> and gives the detail a title", () => {
  const { container } = render(
    <Timeline items={[{ at: "2026-10-01T10:00:00Z", title: "Consult booked", detail: "Oct 4, 2:00 pm" }]} formatAt={() => "9:14 am"} />,
  )
  expect(container.querySelector("time[datetime='2026-10-01T10:00:00Z']")).not.toBeNull()
  expect(screen.getByText("Oct 4, 2:00 pm")).toHaveAttribute("title", "Oct 4, 2:00 pm")
})

it("renders duplicate entries without a React key warning", () => {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {})
  render(<Timeline items={[items[0], items[0]]} formatAt={() => "9:14 am"} />)
  expect(spy.mock.calls.flat().join(" ")).not.toMatch(/same key/)
  spy.mockRestore()
})

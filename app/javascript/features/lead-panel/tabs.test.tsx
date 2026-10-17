import { screen, within } from "@testing-library/react"
import { renderWithProviders } from "@/test/renderWithProviders"
import { LeadPanel } from "./LeadPanel"

const L4 = "aaaaaaaa-0000-4000-8000-000000000004"
const L3 = "aaaaaaaa-0000-4000-8000-000000000003"
const route = (id: string, tab: string) => `/?lead=${id}&tab=${tab}`

it("Summary tab: process steps and the Simbe summary with its next step", async () => {
  renderWithProviders(<LeadPanel />, { route: route(L4, "summary") })

  const process = within(await screen.findByTestId("process"))
  for (const label of ["Screener", "Application", "Consult", "Medical records", "Accepted"]) {
    expect(process.getByText(label)).toBeInTheDocument()
  }
  expect(process.getByText("Complete")).toBeInTheDocument()
  expect(process.getByText("Ongoing")).toBeInTheDocument()
  expect(process.getAllByText("Upcoming")).toHaveLength(3)

  expect(screen.getByText("Simbe summary")).toBeInTheDocument()
  expect(screen.getByText("L4 reached the application on Sep 24 and has not finished it.")).toBeInTheDocument()
  expect(screen.getByText("Suggested next step:")).toBeInTheDocument()
  expect(screen.getByText("Nudge her to finish the application (40% complete).")).toBeInTheDocument()
})

it("Activity tab: a newest-first timeline with the newest dot in brand", async () => {
  renderWithProviders(<LeadPanel />, { route: route(L4, "activity") })

  const items = await screen.findAllByTestId("timeline-item")
  expect(items).toHaveLength(6)
  expect(items[0]).toHaveTextContent("Application started")
  expect(items[0]).toHaveTextContent("Sep 24")
  expect(within(items[0]).getByTestId("timeline-dot")).toHaveClass("bg-brand")
  expect(items[items.length - 1]).toHaveTextContent("Visited the site")
})

it("Source tab: key/value rows, with Self-reported never collected", async () => {
  renderWithProviders(<LeadPanel />, { route: route(L4, "source") })

  const rows = within(await screen.findByTestId("source-rows"))
  expect(rows.getByText("Channel")).toBeInTheDocument()
  expect(rows.getByText("Instagram")).toBeInTheDocument()
  expect(rows.getByText("Campaign")).toBeInTheDocument()
  expect(rows.getByText("c-b")).toBeInTheDocument()
  expect(rows.getByText("Ad")).toBeInTheDocument()
  expect(rows.getByText("First visit")).toBeInTheDocument()
  expect(rows.getByText("Sep 22")).toBeInTheDocument()
  expect(rows.getByText("Pages viewed")).toBeInTheDocument()
  expect(rows.getByText("3")).toBeInTheDocument()
  expect(rows.getByText("Self-reported")).toBeInTheDocument()
  expect(rows.getByText("Not collected")).toBeInTheDocument()
})

it("Screener tab is blank-safe when a lead has no answers, and still shows the note", async () => {
  renderWithProviders(<LeadPanel />, { route: route(L3, "screener") })

  expect(await screen.findByText("No screener answers on record.")).toBeInTheDocument()
  expect(screen.getByText(/visible to the assigned coordinator only/i)).toBeInTheDocument()
})

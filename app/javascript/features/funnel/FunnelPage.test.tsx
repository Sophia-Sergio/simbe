import { screen, within } from "@testing-library/react"
import { mockApi } from "@/test/mockApi"
import { setScenario } from "@/mocks/scenarios"
import { renderWithProviders } from "@/test/renderWithProviders"
import { FunnelPage } from "./FunnelPage"

it("renders six rows with counts, percentages and the qualified row flagged", async () => {
  renderWithProviders(<FunnelPage />)
  expect(await screen.findByText("10 leads")).toBeInTheDocument()
  ;["Inquiry", "Application", "Consult booked", "Attended consult", "Records", "Accepted"].forEach((name) => expect(screen.getByText(name)).toBeInTheDocument())
  expect(screen.getAllByText("50% of previous").length).toBeGreaterThan(0)
  expect(screen.getByText(/Qualified = attended a consult/i)).toBeInTheDocument()
})

it("colours rows before the qualified one dark, the qualified one brand, the rest success", async () => {
  const { container } = renderWithProviders(<FunnelPage />)
  await screen.findByText("10 leads")
  const fills = Array.from(container.querySelectorAll("ol li span.block")).map((el) => el.className)
  expect(fills[0]).toContain("bg-ink")
  expect(fills[2]).toContain("bg-ink")
  expect(fills[3]).toContain("bg-brand")
  expect(fills[4]).toContain("bg-success")
  expect(fills[5]).toContain("bg-success")
})

it("builds the exit line from the next row's drop and the row's top reasons", async () => {
  renderWithProviders(<FunnelPage />)
  expect(await screen.findByText("50% leave here · age, bmi")).toBeInTheDocument()
  expect(screen.getByText("20% leave here")).toBeInTheDocument() // Application -> Consult booked: 80% continue, no reasons
})

it("the last row has no exit line", async () => {
  renderWithProviders(<FunnelPage />)
  await screen.findByText("10 leads")
  const last = screen.getByText("Accepted").closest("li")!
  expect(within(last).queryByText(/leave here/)).toBeNull()
})

it("renders form drop-off bars with humanized labels and the highest in warning", async () => {
  const { container } = renderWithProviders(<FunnelPage />)
  expect(await screen.findByText("Where applicants stop in the form")).toBeInTheDocument()
  expect(screen.getByText("Pregnancy history")).toBeInTheDocument()
  expect(container.querySelector("section[aria-labelledby='form-heading'] .bg-warning")).not.toBeNull()
})

// The mock host answers the funnel with data in every scenario; a real empty agency gets total 0.
const emptyFunnel = () => mockApi({ "GET /api/v1/metrics/funnel": { total: 0, stages: [], form_dropoff: [] } })

it("shows the 'Load your data' link for an owner without data", async () => {
  setScenario("empty")
  emptyFunnel()
  renderWithProviders(<FunnelPage />)
  expect(await screen.findByRole("link", { name: /load your data/i })).toHaveAttribute("href", "/data")
})

it("shows 'Loading your data…' while an upload is pending", async () => {
  setScenario("loading")
  emptyFunnel()
  renderWithProviders(<FunnelPage />)
  expect(await screen.findByText("Loading your data…")).toBeInTheDocument()
})

it("asks a coordinator to ask the owner", async () => {
  setScenario("empty")
  emptyFunnel()
  renderWithProviders(<FunnelPage />, { role: "coordinator" })
  expect(await screen.findByText("Ask your agency owner to load data")).toBeInTheDocument()
})

it("shows an error with retry", async () => {
  mockApi({ "GET /api/v1/metrics/funnel": () => Response.json({ code: "boom", message: "x" }, { status: 500 }) })
  renderWithProviders(<FunnelPage />)
  expect(await screen.findByRole("alert")).toHaveTextContent(/could not load/i)
})

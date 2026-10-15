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
  const tones = Array.from(container.querySelectorAll("ol li [data-tone]")).map((el) => el.getAttribute("data-tone"))
  expect(tones).toEqual(["dark", "dark", "dark", "brand", "success", "success"])
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
const zeroStages = ["inquiry", "application", "consult_booked", "consult_attended", "records", "accepted"].map((key) => ({
  key, label: key, count: 0, pct_of_previous: null, pct_of_total: 0, qualified: key === "consult_attended", exit_reasons: [],
}))
const emptyFunnel = () => mockApi({ "GET /api/v1/metrics/funnel": { total: 0, stages: zeroStages, form_dropoff: [] } })

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

it("shows the qualified row's name in brand colour", async () => {
  renderWithProviders(<FunnelPage />)
  expect(await screen.findByText("Attended consult")).toHaveClass("text-brand-text")
  expect(screen.getByText("Application")).not.toHaveClass("text-brand-text")
})

it("says there are no leads in the range (not 'load your data') when a snapshot exists but the range is empty", async () => {
  emptyFunnel()
  renderWithProviders(<FunnelPage />)
  expect(await screen.findByText("No leads in this range")).toBeInTheDocument()
  expect(screen.queryByRole("link", { name: /load your data/i })).toBeNull()
  expect(screen.getByRole("button", { name: "12 months" })).toBeInTheDocument()
})

it("uses the singular for one lead", async () => {
  mockApi({ "GET /api/v1/metrics/funnel": { total: 1, stages: zeroStages.map((stage, index) => ({ ...stage, count: index === 0 ? 1 : 0, pct_of_total: index === 0 ? 100 : 0 })), form_dropoff: [] } })
  renderWithProviders(<FunnelPage />)
  expect(await screen.findByText("1 lead")).toBeInTheDocument()
})

it("does not flag any form bar when every drop-off is 0%", async () => {
  mockApi({ "GET /api/v1/metrics/funnel": { total: 5, stages: zeroStages, form_dropoff: [{ section: "a", count: 0, pct: 0 }, { section: "b", count: 0, pct: 0 }] } })
  const { container } = renderWithProviders(<FunnelPage />)
  await screen.findByText("Where applicants stop in the form")
  expect(container.querySelector("section[aria-labelledby='form-heading'] [data-tone='warning']")).toBeNull()
})

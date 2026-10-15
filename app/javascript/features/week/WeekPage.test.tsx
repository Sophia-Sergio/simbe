import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { AgentContext } from "@/app/agent"
import { setScenario } from "@/mocks/scenarios"
import { mockApi } from "@/test/mockApi"
import { renderWithProviders } from "@/test/renderWithProviders"
import { WeekPage } from "./WeekPage"

function Home() {
  return <WeekPage />
}

it("renders the greeting, four KPIs, recommendations and the leak", async () => {
  renderWithProviders(<Home />, { route: "/" })
  expect(await screen.findByText(/Good (morning|afternoon|evening), Erin/)).toBeInTheDocument()
  ;["Leads", "Qualified", "Qualified rate", "Cost per qualified"].forEach((label) => expect(screen.getByText(label)).toBeInTheDocument())
  expect(screen.getByText("30.0%")).toBeInTheDocument()
  expect(screen.getByText("$283")).toBeInTheDocument()
  expect(screen.getByText(/2 things worth your time/)).toBeInTheDocument()
  expect(screen.getByRole("img", { name: /50% stall/ })).toBeInTheDocument()
  expect(screen.getByText("Most leads stall before Application")).toBeInTheDocument()
})

it("shows the qualified definition under the Qualified card", async () => {
  renderWithProviders(<Home />)
  expect(await screen.findByText(/Attended a consult/i)).toBeInTheDocument()
})

it("shows a loading state first", () => {
  renderWithProviders(<Home />)
  expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0)
})

it("switching the range refetches with the new range", async () => {
  const seen: string[] = []
  mockApi({ "GET /api/v1/metrics/summary": (req: Request) => {
    seen.push(new URL(req.url).searchParams.get("range") ?? "")
    return Response.json({ snapshot: { id: "s", as_of: "2026-10-01T12:00:00.000Z" }, range: "90d", spend_source: "import", kpis: { leads: { value: 20, previous: null, delta: null }, qualified: { value: 4, previous: null, delta: null }, qualified_rate: { value: 20, previous: null, delta: null, low_sample: false }, cost_per_qualified: { value_cents: 10000, previous_cents: null, delta_cents: null } }, biggest_leak: null, cost_by_channel: [] })
  } })
  const { location } = renderWithProviders(<Home />)
  await screen.findByText("Leads")
  await userEvent.click(screen.getByRole("button", { name: "90 days" }))
  await waitFor(() => expect(seen).toContain("90d"))
  expect(location().search).toContain("range=90d")
})

it("CTA navigates with the range preserved", async () => {
  const { location } = renderWithProviders(<Home />, { route: "/?range=90d" })
  await userEvent.click(await screen.findByRole("button", { name: "Open funnel" }))
  expect(location().pathname).toBe("/funnel")
  expect(location().search).toBe("?range=90d")
})

it("Ask why goes through the agent with the preset question", async () => {
  const open = vi.fn()
  function Spy() {
    return (
      <AgentContext.Provider value={{ isOpen: false, open, close: () => {} }}>
        <WeekPage />
      </AgentContext.Provider>
    )
  }
  renderWithProviders(<Spy />)
  const buttons = await screen.findAllByRole("button", { name: /ask why/i })
  await userEvent.click(buttons[0])
  expect(open).toHaveBeenCalledWith("Why do leads stall before the application and what should we change?")
})

it("labels sample spend", async () => {
  mockApi({ "GET /api/v1/metrics/summary": () => {
    return Response.json({ snapshot: { id: "s", as_of: "2026-10-01T12:00:00.000Z" }, range: "30d", spend_source: "sample", kpis: { leads: { value: 10, previous: null, delta: null }, qualified: { value: 3, previous: null, delta: null }, qualified_rate: { value: 30, previous: null, delta: null, low_sample: true }, cost_per_qualified: { value_cents: 28333, previous_cents: null, delta_cents: null } }, biggest_leak: null, cost_by_channel: [ { channel: "Facebook", cost_per_qualified_cents: 15000, flag: "best" } ] })
  } })
  renderWithProviders(<Home />)
  expect(await screen.findByText("Sample spend")).toBeInTheDocument()
  expect(screen.getByText("sample")).toBeInTheDocument()
})

it("offers 'Load your data' to an owner without a snapshot", async () => {
  setScenario("empty")
  renderWithProviders(<Home />)
  expect(await screen.findByRole("link", { name: /load your data/i })).toHaveAttribute("href", "/data")
})

it("shows 'Loading your data…' while an upload is pending", async () => {
  setScenario("loading")
  renderWithProviders(<Home />)
  expect(await screen.findByText("Loading your data…")).toBeInTheDocument()
})

it("shows an error with a retry when the summary fails", async () => {
  mockApi({ "GET /api/v1/metrics/summary": () => Response.json({ code: "boom", message: "x" }, { status: 500 }) })
  renderWithProviders(<Home />)
  expect(await screen.findByRole("alert")).toHaveTextContent(/could not load/i)
  expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument()
})

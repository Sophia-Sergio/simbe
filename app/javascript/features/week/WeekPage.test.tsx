import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { AgentContext } from "@/app/agent"
import { setScenario } from "@/mocks/scenarios"
import { mockApi } from "@/test/mockApi"
import { renderWithProviders } from "@/test/renderWithProviders"
import { costDelta, greeting, hourIn, WeekPage, weekOf } from "./WeekPage"

function Home() {
  return <WeekPage />
}

it("renders the greeting, four KPIs, recommendations and the leak", async () => {
  renderWithProviders(<Home />, { route: "/" })
  expect(await screen.findByText(/Good (morning|afternoon|evening), Erin/)).toBeInTheDocument()
  ;["Leads", "Qualified", "Qualified rate"].forEach((label) => expect(screen.getByText(label)).toBeInTheDocument())
  expect(screen.getAllByText("Cost per qualified").length).toBeGreaterThan(0)
  expect(screen.getByText("30.0%")).toBeInTheDocument()
  expect(screen.getByText("$283")).toBeInTheDocument()
  expect(screen.getByText(/2 things worth your time/)).toBeInTheDocument()
  expect(screen.getByRole("img", { name: /50% stall/ })).toBeInTheDocument()
  expect(screen.getByText("Most leads stall before Application")).toBeInTheDocument()
})

it("tells the owner how many distinct people the leads are, only when they differ", async () => {
  const kpis = {
    leads: { value: 20, previous: null, delta: null },
    qualified: { value: 4, previous: null, delta: null },
    qualified_rate: { value: 20, previous: null, delta: null, low_sample: false },
    cost_per_qualified: { value_cents: 10000, previous_cents: null, delta_cents: null },
  }
  const summary = (unique: number) => ({ snapshot: { id: "s", as_of: "2026-10-01T12:00:00.000Z" }, range: "30d", spend_source: "import", kpis: { ...kpis, unique_people: unique }, biggest_leak: null, cost_by_channel: [] })

  mockApi({ "GET /api/v1/metrics/summary": summary(17) })
  const { unmount } = renderWithProviders(<Home />)
  const people = await screen.findByText("17 people")
  expect(people).toHaveAttribute("title", "A lead is one inquiry. The same person can inquire more than once.")
  unmount()

  mockApi({ "GET /api/v1/metrics/summary": summary(20) })
  renderWithProviders(<Home />)
  expect(await screen.findByText("Leads")).toBeInTheDocument()
  expect(screen.queryByText(/ people$/)).toBeNull()
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

describe("greeting and week", () => {
  it("greets by the hour: before noon, until six, then evening", () => {
    expect([0, 11, 12, 17, 18, 23].map(greeting)).toEqual([
      "Good morning", "Good morning", "Good afternoon", "Good afternoon", "Good evening", "Good evening",
    ])
  })

  it("takes the hour in the agency's time zone, not the browser's", () => {
    const instant = new Date("2026-10-01T21:00:00Z") // 14:00 in Los Angeles, 21:00 in UTC
    expect(hourIn("America/Los_Angeles", instant)).toBe(14)
    expect(hourIn("UTC", instant)).toBe(21)
  })

  it("names the Monday of the snapshot's week in the agency zone", () => {
    expect(weekOf("2026-10-01T12:00:00Z", "America/Los_Angeles")).toBe("Sep 28")
  })

  it("keeps the Monday right across a DST change inside the week", () => {
    // Sunday Nov 1 2026 23:30 Pacific (DST ended that morning): the week started Monday Oct 26.
    expect(weekOf("2026-11-02T07:30:00Z", "America/Los_Angeles")).toBe("Oct 26")
  })
})

describe("cost delta", () => {
  it("is money, not a percentage, and a rise is bad news", () => {
    expect(costDelta(5000)).toEqual({ text: "+$50.00", tone: "down" })
    expect(costDelta(-12000)).toEqual({ text: "−$120", tone: "up" })
    expect(costDelta(0).tone).toBe("none")
    expect(costDelta(null)).toEqual({ text: "", tone: "none" })
  })
})

it("hides the 'things worth your time' count until the recommendations have loaded", async () => {
  mockApi({ "GET /api/v1/recommendations": async () => { await new Promise((resolve) => setTimeout(resolve, 80)); return Response.json([]) } })
  renderWithProviders(<Home />)
  await screen.findByText(/Week of/)
  expect(screen.queryByText(/worth your time/)).toBeNull()
  expect(await screen.findByText(/0 things worth your time/)).toBeInTheDocument()
})

it("says there is no spend loaded when the agency has none", async () => {
  mockApi({ "GET /api/v1/metrics/summary": () => Response.json({ snapshot: { id: "s", as_of: "2026-10-01T12:00:00.000Z" }, range: "30d", spend_source: "none", kpis: { leads: { value: 10, previous: null, delta: null }, qualified: { value: 3, previous: null, delta: null }, qualified_rate: { value: 30, previous: null, delta: 2.5, low_sample: false }, cost_per_qualified: { value_cents: null, previous_cents: null, delta_cents: null } }, biggest_leak: null, cost_by_channel: [] }) })
  renderWithProviders(<Home />)
  expect(await screen.findByText("No spend loaded")).toBeInTheDocument()
  expect(screen.getByText("+2.5 pp")).toBeInTheDocument()
})

it("loads the numbers when an upload finishes while the page is open", async () => {
  let loaded = false
  mockApi({
    "GET /api/v1/snapshots/current": () =>
      Response.json({ snapshot: loaded ? { id: "s", as_of: "2026-10-01T12:00:00.000Z" } : null, pending: loaded ? null : { upload_id: "u", status: "committing", progress: { pct: 90 } }, files: [] }),
    "GET /api/v1/metrics/summary": () =>
      Response.json(loaded
        ? { snapshot: { id: "s", as_of: "2026-10-01T12:00:00.000Z" }, range: "30d", spend_source: "import", kpis: { leads: { value: 10, previous: null, delta: null }, qualified: { value: 3, previous: null, delta: null }, qualified_rate: { value: 30, previous: null, delta: null, low_sample: true }, cost_per_qualified: { value_cents: 28333, previous_cents: null, delta_cents: null } }, biggest_leak: null, cost_by_channel: [] }
        : { snapshot: null, range: "30d", spend_source: "none", kpis: { leads: { value: 0, previous: null, delta: null }, qualified: { value: 0, previous: null, delta: null }, qualified_rate: { value: 0, previous: null, delta: null, low_sample: true }, cost_per_qualified: { value_cents: null, previous_cents: null, delta_cents: null } }, biggest_leak: null, cost_by_channel: [] }),
  })
  const { queryClient } = renderWithProviders(<Home />)
  expect(await screen.findByText("Loading your data…")).toBeInTheDocument()
  loaded = true
  await queryClient.invalidateQueries({ queryKey: ["snapshot"] })
  expect(await screen.findByText("$283", {}, { timeout: 3000 })).toBeInTheDocument()
})

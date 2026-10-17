import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HttpResponse } from "msw"
import listFixture from "@contracts/examples/leads/list.json"
import type { LeadCard as LeadCardData } from "@/api/types"
import { setScenario } from "@/mocks/scenarios"
import { mockApi } from "@/test/mockApi"
import { renderWithProviders } from "@/test/renderWithProviders"
import { PipelinePage } from "./PipelinePage"

const L7 = "aaaaaaaa-0000-4000-8000-000000000007"

// A fake-timer test that hangs must never leave fake timers on for the rest of the file.
afterEach(() => vi.useRealTimers())

it("renders the four board columns with their counts", async () => {
  renderWithProviders(<PipelinePage />, { route: "/pipeline", role: "owner" })
  for (const [name, count] of [
    ["Action needed", "4"],
    ["In application", "0"],
    ["Consult", "0"],
    ["Qualified", "3"],
  ]) {
    const region = await screen.findByRole("region", { name })
    expect(within(region).getByTestId("column-count")).toHaveTextContent(count)
  }
  expect(await screen.findByText("L4 Alpha")).toBeInTheDocument()
})

it("names each board column as a region without a redundant explicit role", async () => {
  renderWithProviders(<PipelinePage />, { route: "/pipeline", role: "owner" })
  // A <section> with an accessible name is already a region; the explicit role would be redundant.
  expect(await screen.findByRole("region", { name: "Action needed" })).not.toHaveAttribute("role")
})

it("shows an empty column hint", async () => {
  renderWithProviders(<PipelinePage />, { route: "/pipeline", role: "owner" })
  expect(await screen.findAllByText("Nothing here")).toHaveLength(2)
})

it("opens the lead panel from a card via ?lead=", async () => {
  const user = userEvent.setup()
  const { location } = renderWithProviders(<PipelinePage />, { route: "/pipeline", role: "owner" })
  await user.click(await screen.findByRole("button", { name: /L7 Alpha/ }))
  await waitFor(() => expect(location().search).toContain(`lead=${L7}`))
})

it("switches to list view and filters", async () => {
  const user = userEvent.setup()
  renderWithProviders(<PipelinePage />, { route: "/pipeline", role: "owner" })
  await user.click(screen.getByRole("button", { name: "List" }))
  expect(await screen.findByText("L7 Alpha")).toBeInTheDocument()
  await user.type(screen.getByLabelText("Filter leads"), "l4")
  expect(await screen.findByText("L4 Alpha")).toBeInTheDocument()
  await waitFor(() => expect(screen.queryByText("L7 Alpha")).toBeNull())
})

it("debounces the filter so typing l4 quickly issues one request", async () => {
  let listRequests = 0
  mockApi({
    "GET /api/v1/leads": () => {
      listRequests += 1
      return HttpResponse.json({ leads: [], next_cursor: null })
    },
  })
  renderWithProviders(<PipelinePage />, { route: "/pipeline?view=list", role: "owner" })
  await waitFor(() => expect(listRequests).toBe(1)) // the initial, unfiltered list load

  vi.useFakeTimers()
  try {
    // Two strokes inside the debounce window (fireEvent: no keystroke delay): only one request may reach the API.
    const input = screen.getByLabelText("Filter leads")
    fireEvent.change(input, { target: { value: "l" } })
    fireEvent.change(input, { target: { value: "l4" } })
    expect(listRequests).toBe(1)
    await act(async () => {
      vi.advanceTimersByTime(300)
    })
    await vi.waitFor(() => expect(listRequests).toBe(2))
    expect(listRequests).toBe(2)
  } finally {
    vi.useRealTimers()
  }
})

it("keeps a very long lead name from overflowing a list row", async () => {
  const LONG_NAME = `Anastasia ${"Verylongword".repeat(12)}`
  const lead = { ...(listFixture.leads[0] as unknown as LeadCardData), name: LONG_NAME }
  mockApi({ "GET /api/v1/leads": { leads: [lead], next_cursor: null } })
  renderWithProviders(<PipelinePage />, { route: "/pipeline?view=list", role: "owner" })
  expect(await screen.findByText(LONG_NAME)).toHaveClass("min-w-0", "max-w-full", "truncate")
})

it("re-syncs the filter box when the URL changes externally", async () => {
  const { navigate } = renderWithProviders(<PipelinePage />, { route: "/pipeline?view=list&q=l4", role: "owner" })
  expect(await screen.findByLabelText("Filter leads")).toHaveValue("l4")

  // Back/Forward drops ?q: the URL is the source of truth, so the stale text must clear.
  navigate("/pipeline?view=list")
  await waitFor(() => expect(screen.getByLabelText("Filter leads")).toHaveValue(""))
})

it("shows the coordinator dropdown only for owners", async () => {
  const first = renderWithProviders(<PipelinePage />, { route: "/pipeline", role: "owner" })
  expect(await screen.findByRole("combobox", { name: "All coordinators" })).toBeInTheDocument()
  first.unmount()
  renderWithProviders(<PipelinePage />, { route: "/pipeline", role: "coordinator" })
  await screen.findByRole("region", { name: "Action needed" })
  expect(screen.queryByRole("combobox", { name: "All coordinators" })).toBeNull()
})

it("shows column chips and one column at a time on mobile", async () => {
  const user = userEvent.setup()
  renderWithProviders(<PipelinePage />, { route: "/pipeline", role: "owner", viewport: 390 })
  const chips = await screen.findByRole("group", { name: "Pipeline columns" })
  expect(screen.getAllByRole("region")).toHaveLength(1)
  await user.click(within(chips).getByRole("button", { name: /Qualified/ }))
  expect(screen.getByRole("region", { name: "Qualified" })).toBeInTheDocument()
  expect(screen.queryByRole("region", { name: "Action needed" })).toBeNull()
})

it("shows the loading state while a snapshot load is pending", async () => {
  setScenario("loading")
  renderWithProviders(<PipelinePage />, { route: "/pipeline", role: "owner" })
  expect(await screen.findByText("Loading your data…")).toBeInTheDocument()
})

it("asks the owner to load data when there is no snapshot", async () => {
  setScenario("empty")
  renderWithProviders(<PipelinePage />, { route: "/pipeline", role: "owner" })
  expect(await screen.findByRole("link", { name: "Load your data" })).toHaveAttribute("href", "/data")
})

it("tells a coordinator to ask the owner for data", async () => {
  setScenario("empty")
  renderWithProviders(<PipelinePage />, { route: "/pipeline", role: "coordinator" })
  expect(await screen.findByText("Ask your agency owner to load data.")).toBeInTheDocument()
})

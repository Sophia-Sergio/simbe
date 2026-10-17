import { act, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HttpResponse } from "msw"
import currentFixture from "@contracts/examples/snapshots/current.json"
import currentLoadingFixture from "@contracts/examples/snapshots/current-loading.json"
import { setScenario } from "@/mocks/scenarios"
import { mockApi } from "@/test/mockApi"
import { renderWithProviders } from "@/test/renderWithProviders"
import { DataSourcesPage } from "./DataSourcesPage"

const EXPORT_FILES = [
  "leads.csv",
  "stage_history.csv",
  "contact_log.csv",
  "screener_answers.csv",
  "web_sessions.csv",
  "appointments.csv",
  "applications.csv",
]

it("shows the connector cards and the seven CRM rows in the agency's time zone", async () => {
  renderWithProviders(<DataSourcesPage />)

  expect(await screen.findByText("Meta Ads")).toBeInTheDocument()
  expect(screen.getByText("Google Ads")).toBeInTheDocument()
  expect(screen.getAllByText("Sample spend — live sync coming")).toHaveLength(2)

  expect(screen.getByText("Loaded Oct 1, 2026 · 9:14 am")).toBeInTheDocument()
  for (const name of EXPORT_FILES) expect(screen.getByText(name)).toBeInTheDocument()
  expect(screen.getByText("3,530 rows")).toBeInTheDocument()
  expect(screen.getByText("35,300 rows")).toBeInTheDocument()
})

it("connects a platform and then disconnects it through an inline confirmation", async () => {
  const user = userEvent.setup()
  renderWithProviders(<DataSourcesPage />)

  await user.click((await screen.findAllByRole("button", { name: "Connect" }))[0])
  const connected = await screen.findByRole("button", { name: /Connected/ })

  await user.click(connected)
  const confirm = screen.getByRole("group")
  expect(confirm).toHaveTextContent("Disconnect Meta Ads?")
  expect(screen.queryByRole("dialog")).toBeNull() // inline, never a stacked overlay

  await user.click(within(confirm).getByRole("button", { name: "Disconnect" }))
  await waitFor(() => expect(screen.getAllByRole("button", { name: "Connect" })).toHaveLength(2))
})

it("shows the loading strip over the current snapshot while a load is pending", async () => {
  setScenario("loading")
  renderWithProviders(<DataSourcesPage />)
  expect(await screen.findByText("Loading your data… 46%")).toBeInTheDocument()
})

it("shows the empty state when no snapshot was ever loaded", async () => {
  setScenario("empty")
  renderWithProviders(<DataSourcesPage />)
  expect(await screen.findByText("No data loaded yet")).toBeInTheDocument()
  expect(screen.getAllByRole("button", { name: "Upload new snapshot" }).length).toBeGreaterThanOrEqual(1)
})

it("opens the upload modal from the header", async () => {
  const user = userEvent.setup()
  renderWithProviders(<DataSourcesPage />)
  await user.click((await screen.findAllByRole("button", { name: "Upload new snapshot" }))[0])
  expect(await screen.findByRole("dialog")).toHaveTextContent("Drop your 7 CSV exports")
})

it("says so when the snapshot call fails, with a retry", async () => {
  setScenario("error")
  renderWithProviders(<DataSourcesPage />)
  // Both cards fail in this scenario; the CRM one keeps its own message.
  expect(await screen.findByText("We couldn't load your data.")).toBeInTheDocument()
  expect(screen.getByText("We couldn't load your ad connections.")).toBeInTheDocument()
})

it("keeps the upload path usable while the data call is failing", async () => {
  setScenario("error")
  const user = userEvent.setup()
  renderWithProviders(<DataSourcesPage />)
  await user.click((await screen.findAllByRole("button", { name: "Upload new snapshot" }))[0])
  expect(await screen.findByRole("dialog")).toHaveTextContent("Drop your 7 CSV exports")
})

it("shows an ad-connection failure in its own card without hiding the CRM exports", async () => {
  mockApi({
    "GET /api/v1/ad_connections": () => HttpResponse.json({ error: { code: "boom", message: "x" } }, { status: 500 }),
  })
  renderWithProviders(<DataSourcesPage />)

  expect(await screen.findByRole("alert")).toHaveTextContent(/ad connections/i)
  // The CRM card and the upload path are unrelated to the connector failure.
  expect(screen.getByText("leads.csv")).toBeInTheDocument()
  expect(screen.getAllByRole("button", { name: "Upload new snapshot" }).length).toBeGreaterThanOrEqual(1)
})

it("keeps the last snapshot visible when a refetch fails", async () => {
  let calls = 0
  mockApi({
    "GET /api/v1/snapshots/current": () => {
      calls += 1
      return calls === 1
        ? HttpResponse.json(currentFixture)
        : HttpResponse.json({ error: { code: "boom", message: "x" } }, { status: 500 })
    },
  })
  const { queryClient } = renderWithProviders(<DataSourcesPage />)
  expect(await screen.findByText("3,530 rows")).toBeInTheDocument()

  await act(async () => {
    await queryClient.refetchQueries({ queryKey: ["snapshot"] })
  })

  expect(calls).toBeGreaterThanOrEqual(2)

  // A transient poll failure must not replace the data on screen with an error card.
  expect(screen.getByText("3,530 rows")).toBeInTheDocument()
  expect(screen.queryByText("We couldn't load your data.")).toBeNull()
})

it("does not drop an in-flight upload modal when a pending refetch fails", async () => {
  let calls = 0
  mockApi({
    "GET /api/v1/snapshots/current": () => {
      calls += 1
      return calls <= 2
        ? HttpResponse.json(currentLoadingFixture)
        : HttpResponse.json({ error: { code: "boom", message: "x" } }, { status: 500 })
    },
  })
  const user = userEvent.setup()
  const { queryClient } = renderWithProviders(<DataSourcesPage />)

  await user.click((await screen.findAllByRole("button", { name: "Upload new snapshot" }))[0])
  expect(await screen.findByRole("dialog")).toBeInTheDocument()

  await act(async () => {
    await queryClient.refetchQueries({ queryKey: ["snapshot"] })
  })

  expect(screen.getByRole("dialog")).toBeInTheDocument()
  expect(screen.getByText(/Loading your data/)).toBeInTheDocument()
  expect(screen.queryByText("We couldn't load your data.")).toBeNull()
})

it("keeps the pending strip when the 2 s poll fails", async () => {
  vi.useFakeTimers()
  try {
    let calls = 0
    mockApi({
      "GET /api/v1/snapshots/current": () => {
        calls += 1
        return calls === 1
          ? HttpResponse.json(currentLoadingFixture)
          : HttpResponse.json({ error: { code: "boom", message: "x" } }, { status: 500 })
      },
    })
    renderWithProviders(<DataSourcesPage />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(screen.getByText("Loading your data… 46%")).toBeInTheDocument()

    // The hook refetches every 2 s while `pending` is set; this one fails.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100)
    })
    expect(calls).toBeGreaterThanOrEqual(2)

    expect(screen.getByText("Loading your data… 46%")).toBeInTheDocument()
    expect(screen.queryByText("We couldn't load your data.")).toBeNull()
  } finally {
    vi.useRealTimers()
  }
})

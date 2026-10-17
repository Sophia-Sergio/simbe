import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { setScenario } from "@/mocks/scenarios"
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
  expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't load your data/i)
})

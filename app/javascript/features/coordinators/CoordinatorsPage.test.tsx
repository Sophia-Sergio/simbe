import { QueryClient } from "@tanstack/react-query"
import { render, screen, within } from "@testing-library/react"
import { RouterProvider } from "react-router-dom"
import listFixture from "@contracts/examples/coordinators/list.json"
import type { CoordinatorRow } from "@/api/types"
import type { FeatureModule } from "@/app/feature"
import { Providers } from "@/app/Providers"
import { buildRegistry } from "@/app/registry"
import { createAppRouter } from "@/app/router"
import { setScenario } from "@/mocks/scenarios"
import { asRole, mockApi, setViewport } from "@/test/mockApi"
import { renderWithProviders } from "@/test/renderWithProviders"
import { CoordinatorsPage } from "./CoordinatorsPage"
import { feature } from "./feature"

// Lane override 1: the contract fixture is all `on_track`; this variant makes Dana `needs_support`
// (more than 8 overdue) so both status pills render.
const withNeedsSupport: CoordinatorRow[] = (listFixture as CoordinatorRow[]).map((row) =>
  row.name === "Dana Ortiz" ? { ...row, overdue: 11, status: "needs_support" as const } : row,
)

const nextActionsStub: FeatureModule = {
  id: "next-actions",
  routes: [{ path: "next-actions", element: <div>next actions</div>, handle: { roles: ["coordinator"] } }],
}

it("renders the owner-only grid with stats and status pills", async () => {
  mockApi({ "/api/v1/coordinators": withNeedsSupport })
  renderWithProviders(<CoordinatorsPage />)

  expect(await screen.findByText("Dana Ortiz")).toBeInTheDocument()
  expect(screen.getByText("Jess Kim")).toBeInTheDocument()
  expect(screen.getByText("Priya Shah")).toBeInTheDocument()
  expect(screen.getByText("Needs support")).toBeInTheDocument()
  expect(screen.getAllByText("On track")).toHaveLength(2)
  expect(screen.getByText("Owner only")).toBeInTheDocument()
  expect(screen.getByText(/can reflect lead mix as well as effort/i)).toBeInTheDocument()

  const dana = screen.getByRole("link", { name: /Dana Ortiz/ })
  expect(within(dana).getByText(/4 leads · 40% of leads/)).toBeInTheDocument()
  expect(within(dana).getByText("23m")).toBeInTheDocument() // formatDuration(22.5)
  expect(within(dana).getByText("0.0%")).toBeInTheDocument() // formatPct(0)
  expect(within(dana).getByText("11")).toBeInTheDocument() // overdue stays an integer
})

it("URL-encodes the coordinator name in the detail link", async () => {
  renderWithProviders(<CoordinatorsPage />)

  const dana = await screen.findByRole("link", { name: /Dana Ortiz/ })
  expect(dana).toHaveAttribute("href", "/coordinators/Dana%20Ortiz")
})

const TRICKY_NAMES = ["Dana Ortiz Jr.", "J. Smith", "A/B", "50%", "José"]

it.each(TRICKY_NAMES)("URL-encodes %s in the detail link", async (name) => {
  const row = (listFixture as CoordinatorRow[])[0]
  mockApi({ "/api/v1/coordinators": [{ ...row, name }] })
  renderWithProviders(<CoordinatorsPage />)

  const link = (await screen.findByText(name, { exact: true })).closest("a")
  expect(link).toHaveAttribute("href", `/coordinators/${encodeURIComponent(name)}`)
})

it("shows Loading your data while a snapshot import is in flight", async () => {
  setScenario("loading")
  renderWithProviders(<CoordinatorsPage />)

  expect(await screen.findByText(/Loading your data/)).toBeInTheDocument()
})

it("gives an owner with no snapshot the Load your data link", async () => {
  setScenario("empty")
  renderWithProviders(<CoordinatorsPage />)

  expect(await screen.findByRole("link", { name: "Load your data" })).toHaveAttribute("href", "/data")
})

it("shows a retryable error when the coordinators call fails", async () => {
  mockApi({
    "/api/v1/coordinators": () =>
      new Response(JSON.stringify({ error: { code: "server_error", message: "boom" } }), { status: 500 }),
  })
  renderWithProviders(<CoordinatorsPage />)

  expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't load coordinator stats.")
  expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument()
})

it("shows a retryable error when the snapshot call fails while the stats load", async () => {
  mockApi({
    "/api/v1/snapshots/current": () =>
      new Response(JSON.stringify({ error: { code: "server_error", message: "boom" } }), { status: 500 }),
  })
  renderWithProviders(<CoordinatorsPage />)

  expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't load your data.")
  expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument()
  // An owner who already loaded data must never be told to load it again.
  expect(screen.queryByRole("link", { name: "Load your data" })).toBeNull()
})

it("redirects a coordinator to /next-actions without ever calling the coordinators API", async () => {
  asRole("coordinator")
  setViewport(1280)
  const fetchSpy = vi.spyOn(globalThis, "fetch")
  const router = createAppRouter(buildRegistry([feature, nextActionsStub]), { initialEntries: ["/coordinators"] })
  render(
    <Providers queryClient={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </Providers>,
  )

  await vi.waitFor(() => expect(router.state.location.pathname).toBe("/next-actions"))
  const urls = fetchSpy.mock.calls.map(([input]) => String(input))
  expect(urls.some((url) => url.includes("/api/v1/coordinators"))).toBe(false)
  fetchSpy.mockRestore()
})

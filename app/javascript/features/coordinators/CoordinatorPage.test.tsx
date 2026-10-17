import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HttpResponse } from "msw"
import detailDana from "@contracts/examples/coordinators/detail-dana.json"
import type { CoordinatorDetail } from "@/api/types"
import { mockApi } from "@/test/mockApi"
import { renderWithProviders } from "@/test/renderWithProviders"
import { CoordinatorPage } from "./CoordinatorPage"

const detail = detailDana as CoordinatorDetail
const DANA = "aaaaaaaa-0000-4000-8000-000000000004"
const route = "/coordinators/Dana%20Ortiz"
const path = "/coordinators/:name"

it("shows the KPIs and opens the lead panel from a needs-action row", async () => {
  const { location } = renderWithProviders(<CoordinatorPage />, { route, path })

  expect(await screen.findByRole("heading", { name: "Dana Ortiz" })).toBeInTheDocument()
  expect(screen.getByText("4 leads · 40% of leads")).toBeInTheDocument()
  for (const label of ["Leads", "Qualified", "Qualified rate", "First reply"]) {
    expect(screen.getByText(label)).toBeInTheDocument()
  }
  expect(screen.getByText("23m")).toBeInTheDocument() // formatDuration(22.5)

  // The three queue rows from the fixture; clicking one opens the lead panel on that lead.
  const row = await screen.findByRole("button", { name: /L4 Alpha/ })
  expect(row).toHaveTextContent("Nudge applications")
  await userEvent.click(row)

  expect(location().search).toContain(`lead=${DANA}`)
})

it("formats a two-hour median first reply as '2h 10m'", async () => {
  mockApi({
    "/api/v1/coordinators/:name": {
      ...detail,
      first_reply_minutes: 130,
      kpis: { ...detail.kpis, first_reply_minutes: 130 },
    },
  })
  renderWithProviders(<CoordinatorPage />, { route, path })

  expect(await screen.findByText("2h 10m")).toBeInTheDocument()
})

it("clamps an out-of-range KPI bar to 100% instead of overflowing the track", async () => {
  mockApi({ "/api/v1/coordinators/:name": { ...detail, kpis: { ...detail.kpis, qualified_rate: 140 } } })
  renderWithProviders(<CoordinatorPage />, { route, path })

  const card = (await screen.findByText("Qualified rate")).closest("div.rounded-card") as HTMLElement
  expect(within(card).getByRole("presentation").firstElementChild).toHaveStyle({ width: "100%" })
})

it("shows a not-found state for an unknown coordinator", async () => {
  mockApi({
    "/api/v1/coordinators/:name": () =>
      new Response(JSON.stringify({ error: { code: "not_found", message: "Not found" } }), { status: 404 }),
  })
  renderWithProviders(<CoordinatorPage />, { route: "/coordinators/Nobody", path })

  expect(await screen.findByText("We couldn't find that coordinator")).toBeInTheDocument()
})

it("mobile: renders the needs-action list as full-width cards, not a table", async () => {
  renderWithProviders(<CoordinatorPage />, { route, path, viewport: 390 })

  expect(await screen.findByText("L4 Alpha")).toBeInTheDocument()
  expect(screen.queryByRole("table")).toBeNull()
})

it("shows a retryable error when the snapshot call fails while the detail loads", async () => {
  mockApi({
    "/api/v1/snapshots/current": () =>
      new Response(JSON.stringify({ error: { code: "server_error", message: "boom" } }), { status: 500 }),
  })
  renderWithProviders(<CoordinatorPage />, { route, path })

  expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't load your data.")
  expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument()
  expect(screen.queryByText("Load your data")).toBeNull()
})

const TRICKY_NAMES = ["Dana Ortiz Jr.", "J. Smith", "A/B", "50%", "José"]

it.each(TRICKY_NAMES)("decodes %s from the route and matches the mock API", async (name) => {
  // Echo the decoded path segment, so a pass proves the encoded route matched the mock handler.
  mockApi({
    "/api/v1/coordinators/:name": (request: Request) =>
      HttpResponse.json({
        ...detail,
        name: decodeURIComponent(new URL(request.url).pathname.split("/").pop() ?? ""),
      }),
  })
  renderWithProviders(<CoordinatorPage />, { route: `/coordinators/${encodeURIComponent(name)}`, path })

  expect(await screen.findByRole("heading", { name })).toBeInTheDocument()
})

it("desktop: every needs-action row is a control named by its lead and reason", async () => {
  renderWithProviders(<CoordinatorPage />, { route, path })

  const row = await screen.findByRole("button", {
    name: "L4 Alpha — Application 40% · quiet 8d · last section pregnancy history",
  })
  expect(row).toBeInTheDocument()
})

it("renders the needs-action reason verbatim as text, never as HTML", async () => {
  const reason = "<b>Application 40%</b> quiet 8d"
  mockApi({ "/api/v1/coordinators/:name": { ...detail, needs_action: [{ ...detail.needs_action[0], reason }] } })
  renderWithProviders(<CoordinatorPage />, { route, path })

  expect(await screen.findByText(reason)).toBeInTheDocument()
  expect(document.querySelector("b")).toBeNull()
})

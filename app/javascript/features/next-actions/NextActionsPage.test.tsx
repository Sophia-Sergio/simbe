import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import nextActionsFixture from "@contracts/examples/next-actions/next-actions.json"
import type { NextActions } from "@/api/types"
import { setScenario } from "@/mocks/scenarios"
import { mockApi } from "@/test/mockApi"
import { renderWithProviders } from "@/test/renderWithProviders"
import { NextActionsPage } from "./NextActionsPage"

const fixture = nextActionsFixture as NextActions
const EMPTY: NextActions = {
  ...fixture,
  progress: { done: 0, total: 0 },
  queues: fixture.queues.map((queue) => ({ ...queue, count: 0, items: [] })),
}

// The mock filters /next_actions to the signed-in coordinator: Dana sees L4 (nudge), L3 (rebook)
// and L10 (paused) — the text-back queue is empty for her (lane override 4).
it("renders the four queue wells, hints, the open pill, the subtitle and the progress card", async () => {
  renderWithProviders(<NextActionsPage />, { role: "coordinator" })

  for (const title of ["Text back now", "Nudge applications", "Rebook consults", "Paused, due back"]) {
    expect(await screen.findByRole("region", { name: title })).toBeInTheDocument()
  }
  expect(screen.getByRole("region", { name: "Text back now" })).toHaveTextContent("New leads, no message sent yet")
  expect(screen.getByRole("region", { name: "Nudge applications" })).toHaveTextContent("Quiet 24h+ mid-application")
  expect(screen.getByText("3 open")).toBeInTheDocument()
  expect(screen.getByText("0 / 3")).toBeInTheDocument()
  expect(screen.getByText(/Thursday Oct 1 · most urgent first/)).toBeInTheDocument()
  // Dana's empty queue, and the desktop board never shows the mobile chips.
  expect(screen.getByRole("region", { name: "Text back now" })).toHaveTextContent("Nothing here")
  expect(screen.queryByRole("button", { name: /Text back now/ })).toBeNull()
})

it("Done updates the queue, header and progress immediately, and Undo restores them", async () => {
  renderWithProviders(<NextActionsPage />, { role: "coordinator" })

  const nudge = await screen.findByRole("region", { name: "Nudge applications" })
  await userEvent.click(within(nudge).getByRole("button", { name: "Done" }))

  await screen.findByText("2 open")
  expect(screen.getByText("1 / 3")).toBeInTheDocument()
  expect(within(nudge).getByRole("button", { name: "Undo" })).toBeInTheDocument()
  expect(within(nudge).getByTestId("task-card")).toHaveClass("opacity-50")
  expect(within(nudge).getByText("0")).toBeInTheDocument()

  await userEvent.click(within(nudge).getByRole("button", { name: "Undo" }))

  await screen.findByText("3 open")
  expect(screen.getByText("0 / 3")).toBeInTheDocument()
  expect(within(nudge).getByRole("button", { name: "Done" })).toBeInTheDocument()
  expect(within(nudge).getByTestId("task-card")).not.toHaveClass("opacity-50")
})

it("a failed Done rolls back, toasts, and leaves no unhandled rejection", async () => {
  const rejections: unknown[] = []
  const onRejection = (reason: unknown) => rejections.push(reason)
  process.on("unhandledRejection", onRejection)
  mockApi({
    "POST /api/v1/next_actions/aaaaaaaa-0000-4000-8000-000000000004/nudge_applications/completion": () =>
      new Response(JSON.stringify({ error: { code: "server_error", message: "boom" } }), { status: 500 }),
  })
  renderWithProviders(<NextActionsPage />, { role: "coordinator" })

  const nudge = await screen.findByRole("region", { name: "Nudge applications" })
  await userEvent.click(within(nudge).getByRole("button", { name: "Done" }))

  // The optimistic change is rolled back, the toast explains, and nothing escapes the handler.
  await waitFor(() => expect(within(nudge).getByRole("button", { name: "Done" })).toBeEnabled())
  expect(screen.getByText("3 open")).toBeInTheDocument()
  expect(document.querySelector('[data-testid="toast"]')).toHaveTextContent("Couldn't save")

  await new Promise((resolve) => setTimeout(resolve, 0))
  process.off("unhandledRejection", onRejection)
  expect(rejections).toEqual([])
})

it("clicking a card body opens the lead panel on that lead", async () => {
  const { location } = renderWithProviders(<NextActionsPage />, { role: "coordinator" })

  const nudge = await screen.findByRole("region", { name: "Nudge applications" })
  await userEvent.click(within(nudge).getByText("L4 Alpha"))

  expect(location().search).toContain("lead=aaaaaaaa-0000-4000-8000-000000000004")
})

it("the contact button opens the lead panel too", async () => {
  const { location } = renderWithProviders(<NextActionsPage />, { role: "coordinator" })

  const rebook = await screen.findByRole("region", { name: "Rebook consults" })
  await userEvent.click(within(rebook).getByRole("button", { name: "Call" }))

  expect(location().search).toContain("lead=aaaaaaaa-0000-4000-8000-000000000003")
  expect(location().search).toContain("tab=summary")
})

it("shows 'You're all caught up' once every action is done", async () => {
  const allDone: NextActions = {
    ...fixture,
    progress: { done: 4, total: 4 },
    queues: fixture.queues.map((queue) => ({
      ...queue,
      count: 0,
      items: queue.items.map((item) => ({ ...item, done: true })),
    })),
  }
  mockApi({ "/api/v1/next_actions": allDone })
  renderWithProviders(<NextActionsPage />, { role: "coordinator" })

  expect(await screen.findByText(/all caught up/)).toBeInTheDocument()
  expect(screen.getByText("0 open")).toBeInTheDocument()
})

it("shows four empty wells when a snapshot is loaded but has no actions", async () => {
  mockApi({ "/api/v1/next_actions": EMPTY })
  renderWithProviders(<NextActionsPage />, { role: "coordinator" })

  const wells = await screen.findAllByText("Nothing here")
  expect(wells).toHaveLength(4)
  expect(screen.queryByText(/all caught up/)).toBeNull()
})

it("shows Loading your data while a snapshot import is in flight", async () => {
  setScenario("loading")
  renderWithProviders(<NextActionsPage />, { role: "coordinator" })

  expect(await screen.findByText(/Loading your data/)).toBeInTheDocument()
})

it("tells a coordinator with no snapshot to ask the owner", async () => {
  setScenario("empty")
  renderWithProviders(<NextActionsPage />, { role: "coordinator" })

  expect(await screen.findByText("Ask your agency owner to load data.")).toBeInTheDocument()
})

it("gives an owner with no snapshot the Load your data link", async () => {
  setScenario("empty")
  renderWithProviders(<NextActionsPage />, { role: "owner" })

  expect(await screen.findByRole("link", { name: "Load your data" })).toHaveAttribute("href", "/data")
})

it("on mobile switches queues with chips when more than two are non-empty", async () => {
  renderWithProviders(<NextActionsPage />, { role: "coordinator", viewport: 390 })

  // The first non-empty queue is selected by default and is the only well on screen.
  expect(await screen.findByRole("region", { name: "Nudge applications" })).toBeInTheDocument()
  expect(screen.getByRole("button", { name: /Nudge applications/ })).toHaveAttribute("aria-pressed", "true")
  expect(screen.queryByRole("region", { name: "Rebook consults" })).toBeNull()

  await userEvent.click(screen.getByRole("button", { name: /Rebook consults/ }))

  expect(await screen.findByRole("region", { name: "Rebook consults" })).toBeInTheDocument()
  expect(screen.queryByRole("region", { name: "Nudge applications" })).toBeNull()
})

it("shows the error state when the actions call fails", async () => {
  mockApi({
    "/api/v1/next_actions": () =>
      new Response(JSON.stringify({ error: { code: "server_error", message: "boom" } }), { status: 500 }),
  })
  renderWithProviders(<NextActionsPage />, { role: "coordinator" })

  expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't load today's actions.")
})

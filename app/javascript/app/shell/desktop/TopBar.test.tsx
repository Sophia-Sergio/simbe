import { act, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { setScenario } from "@/mocks/scenarios"
import { mockApi } from "@/test/mockApi"
import { renderShell } from "./renderShell"

it("has a labelled search button with the ⌘K hint that opens the palette", async () => {
  const { palette } = renderShell()
  const search = screen.getByRole("button", { name: /Search candidates/ })
  expect(search).toHaveTextContent("⌘K")
  expect(palette()).toHaveTextContent("closed")
  await userEvent.click(search)
  expect(palette()).toHaveTextContent("open")
})

it("renders topBarRight items", () => {
  renderShell()
  expect(screen.getByText("right item")).toBeInTheDocument()
})

it("shows the snapshot date in the agency time zone", async () => {
  mockApi({
    "GET /api/v1/snapshots/current": { snapshot: { id: "s1", as_of: "2026-10-01T16:14:00Z", row_counts: {} }, pending: null, files: [] },
  })
  renderShell()
  expect(await screen.findByText("Snapshot Oct 1")).toBeInTheDocument()
})

it("shows load progress while an upload is pending", async () => {
  setScenario("loading")
  renderShell()
  // The Toast region is also a status; the pill is the one carrying the progress text.
  const status = await screen.findByText(/Loading data… \d+%/)
  expect(status).toHaveAttribute("role", "status")
})

it("returns to the snapshot date when the pending load finishes", async () => {
  let pending = true
  mockApi({
    "GET /api/v1/snapshots/current": () =>
      Response.json({
        snapshot: { id: "s1", as_of: "2026-10-01T16:14:00Z", row_counts: {} },
        pending: pending ? { upload_id: "u1", status: "committing", progress: { pct: 46 } } : null,
        files: [],
      }),
  })
  const { queryClient } = renderShell()
  expect(await screen.findByText("Loading data… 46%")).toHaveAttribute("role", "status")
  pending = false
  await act(async () => {
    await queryClient.invalidateQueries({ queryKey: ["snapshot"] })
  })
  expect(await screen.findByText("Snapshot Oct 1")).toBeInTheDocument()
  expect(screen.queryByText(/Loading data/)).toBeNull()
})

it("hides the pill when there is no snapshot", async () => {
  mockApi({ "GET /api/v1/snapshots/current": { snapshot: null, pending: null, files: [] } })
  renderShell()
  await waitFor(() => expect(screen.getByRole("button", { name: "Account menu" })).toBeInTheDocument())
  await new Promise((resolve) => setTimeout(resolve, 50))
  expect(screen.queryByText(/Snapshot/)).toBeNull()
})

it("opens the user menu, closes it with Esc and on an outside click", async () => {
  renderShell()
  const trigger = screen.getByRole("button", { name: "Account menu" })
  await userEvent.click(trigger)
  expect(screen.getByRole("menu")).toHaveTextContent("erin@harbor.test")
  await userEvent.keyboard("{Escape}")
  expect(screen.queryByRole("menu")).toBeNull()
  await userEvent.click(trigger)
  await userEvent.click(document.body)
  expect(screen.queryByRole("menu")).toBeNull()
})

it("Sign out in the menu calls onSignOut", async () => {
  const onSignOut = vi.fn()
  renderShell({ onSignOut })
  await userEvent.click(screen.getByRole("button", { name: "Account menu" }))
  await userEvent.click(screen.getByRole("menuitem", { name: "Sign out" }))
  expect(onSignOut).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole("menu")).toBeNull()
})

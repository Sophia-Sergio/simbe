import { HttpResponse } from "msw"
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useEffect } from "react"
import detailCoordinator from "@contracts/examples/leads/detail-coordinator.json"
import detailOwner from "@contracts/examples/leads/detail-owner.json"
import { useLeadPanel } from "@/app/leadPanel"
import { mockApi } from "@/test/mockApi"
import { renderWithProviders } from "@/test/renderWithProviders"
import { LeadPanel } from "./LeadPanel"

const L4 = "aaaaaaaa-0000-4000-8000-000000000004"
const L3 = "aaaaaaaa-0000-4000-8000-000000000003"
const UNKNOWN = "aaaaaaaa-0000-4000-8000-000000000099"
const route = (tab?: string) => `/?lead=${L4}${tab ? `&tab=${tab}` : ""}`

/** Registers the panel's Prev/Next list the way a list screen would. */
function PanelHarness({ ids }: { ids: string[] }) {
  const { setIds } = useLeadPanel()
  useEffect(() => {
    setIds(ids)
  }, [ids, setIds])
  return <LeadPanel />
}

/** Lets a test open another lead without a list screen. */
function Opener({ to }: { to: string }) {
  const { open } = useLeadPanel()
  return (
    <button type="button" onClick={() => open(to)}>
      open other
    </button>
  )
}

it("shows the header, contact, screener ring and consult for a lead", async () => {
  renderWithProviders(<LeadPanel />, { route: route() })

  expect(await screen.findByRole("heading", { name: "L4 Alpha" })).toBeInTheDocument()
  expect(screen.getByText("Dana Ortiz")).toBeInTheDocument()
  expect(screen.getByText("Application · Nudge")).toBeInTheDocument()
  expect(screen.getByText("ID")).toBeInTheDocument()
  expect(screen.getByText("l4.alpha@example.com")).toBeInTheDocument()
  expect(screen.getByText("•••-••••-0004")).toBeInTheDocument()
  expect(screen.getByText("28 years old")).toBeInTheDocument()
  expect(screen.getByText(/10 met/)).toBeInTheDocument()
  expect(screen.getByText("No consult scheduled")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Book consult" })).toHaveAttribute("aria-disabled", "true")
  expect(screen.getByRole("button", { name: "Book consult" })).toHaveAttribute(
    "title",
    "Booking integration not connected",
  )
})

it("owner: shows verdict pills but never raw answers, and masks the phone", async () => {
  renderWithProviders(<LeadPanel />, { route: route("screener") })

  expect(await screen.findAllByText("Met")).toHaveLength(10)
  expect(screen.queryByTestId("raw-answer")).toBeNull()
  expect(screen.getByText(/visible to the assigned coordinator only/i)).toBeInTheDocument()
  expect(screen.getByText("•••-••••-0004")).toBeInTheDocument()
  expect(screen.queryByRole("link", { name: "Send text" })).toBeNull()
  expect(screen.queryByRole("link", { name: "Call" })).toBeNull()
  expect(screen.queryByTestId("mark-done")).toBeNull()
  expect(screen.queryByRole("button", { name: /Actions/ })).toBeNull()
})

it("the assigned coordinator: raw answers, contact links and Mark done", async () => {
  renderWithProviders(<LeadPanel />, { role: "coordinator", route: route("screener") })

  expect(await screen.findAllByTestId("raw-answer")).toHaveLength(10)
  expect(screen.getByText("28")).toBeInTheDocument()
  expect(screen.getByText("555-0183-0004")).toBeInTheDocument()

  await userEvent.click(screen.getByRole("tab", { name: "Summary" }))
  expect(screen.getByRole("link", { name: "Send text" })).toHaveAttribute("href", "sms:555-0183-0004")
  expect(screen.getByRole("link", { name: "Call" })).toHaveAttribute("href", "tel:555-0183-0004")
  expect(screen.getByTestId("mark-done")).toHaveTextContent("Mark done")
  expect(screen.getByRole("button", { name: /Actions/ })).toBeInTheDocument()
})

it("omits the contact links when the coordinator has no phone number", async () => {
  mockApi({
    [`GET /api/v1/leads/${L4}`]: () =>
      HttpResponse.json({ ...detailCoordinator, contact: { ...detailCoordinator.contact, phone: null } }),
  })
  renderWithProviders(<LeadPanel />, { role: "coordinator", route: route() })

  await screen.findByRole("heading", { name: "L4 Alpha" })
  // can_contact is true, but there is no number to dial: never an empty sms:/tel: target.
  expect(screen.queryByRole("link", { name: "Send text" })).toBeNull()
  expect(screen.queryByRole("link", { name: "Call" })).toBeNull()
  expect(screen.queryByRole("button", { name: /Actions/ })).toBeNull()
  expect(screen.getByText("—")).toBeInTheDocument()
  // Mark done does not need a phone.
  expect(screen.getByTestId("mark-done")).toBeInTheDocument()
})

it("the Actions menu holds Send text/Call", async () => {
  renderWithProviders(<LeadPanel />, { role: "coordinator", route: route() })

  await screen.findByRole("heading", { name: "L4 Alpha" })
  await userEvent.click(screen.getByRole("button", { name: /Actions/ }))

  const menu = await screen.findByRole("menu")
  expect(within(menu).getByRole("menuitem", { name: "Send text" })).toHaveAttribute("href", "sms:555-0183-0004")
  expect(within(menu).getByRole("menuitem", { name: "Call" })).toHaveAttribute("href", "tel:555-0183-0004")
})

it("tabs switch and persist in the URL", async () => {
  const view = renderWithProviders(<LeadPanel />, { route: route() })

  await screen.findByRole("heading", { name: "L4 Alpha" })
  await userEvent.click(screen.getByRole("tab", { name: "Activity" }))

  await waitFor(() => expect(view.location().search).toContain("tab=activity"))
})

it("Esc closes the panel and clears the URL", async () => {
  const view = renderWithProviders(<LeadPanel />, { route: route("activity") })

  await screen.findByRole("heading", { name: "L4 Alpha" })
  await userEvent.keyboard("{Escape}")

  await waitFor(() => expect(view.location().search).not.toContain("lead="))
  expect(screen.queryByRole("dialog")).toBeNull()
})

it("the Close control closes the panel", async () => {
  const view = renderWithProviders(<LeadPanel />, { route: route() })

  await screen.findByRole("heading", { name: "L4 Alpha" })
  await userEvent.click(screen.getByRole("button", { name: "Close lead panel" }))

  await waitFor(() => expect(view.location().search).not.toContain("lead="))
})

it("Prev/Next cycle the ids of the list on screen", async () => {
  const view = renderWithProviders(<PanelHarness ids={[L4, L3]} />, { route: route() })

  await screen.findByRole("heading", { name: "L4 Alpha" })
  await userEvent.click(screen.getByRole("button", { name: "Next lead" }))
  expect(await screen.findByRole("heading", { name: "L3 Alpha" })).toBeInTheDocument()
  expect(view.location().search).toContain(L3)
})

it("disables Prev/Next when no list is registered", async () => {
  renderWithProviders(<LeadPanel />, { route: route() })

  await screen.findByRole("heading", { name: "L4 Alpha" })
  expect(screen.getByRole("button", { name: "Previous lead" })).toBeDisabled()
  expect(screen.getByRole("button", { name: "Next lead" })).toBeDisabled()
})

it("shows the not-available state for a lead outside scope", async () => {
  renderWithProviders(<LeadPanel />, { route: `/?lead=${UNKNOWN}` })

  expect(await screen.findByText("This lead isn't available")).toBeInTheDocument()
})

it("does not flash another lead's data while the next one loads", async () => {
  renderWithProviders(
    <>
      <Opener to={UNKNOWN} />
      <LeadPanel />
    </>,
    { route: route() },
  )

  await screen.findByRole("heading", { name: "L4 Alpha" })
  await userEvent.click(screen.getByRole("button", { name: "open other" }))

  expect(await screen.findByText("This lead isn't available")).toBeInTheDocument()
  expect(screen.queryByText("L4 Alpha")).toBeNull()
})

it("shows an ErrorState with retry when the load fails", async () => {
  mockApi({
    [`GET /api/v1/leads/${L4}`]: () =>
      HttpResponse.json({ error: { code: "server_error", message: "boom" } }, { status: 500 }),
  })
  renderWithProviders(<LeadPanel />, { route: route() })

  expect(await screen.findByRole("alert")).toHaveTextContent(/something went wrong/i)
  expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument()
})

it("Mark done toggles through the completion API and turns green", async () => {
  renderWithProviders(<LeadPanel />, { role: "coordinator", route: route() })

  const done = await screen.findByTestId("mark-done")
  expect(done).toHaveTextContent("Mark done")

  await userEvent.click(done)
  await waitFor(() => expect(screen.getByTestId("mark-done")).toHaveTextContent("Done"))
  expect(screen.getByTestId("mark-done")).toHaveAttribute("data-done", "true")
  expect(screen.getByTestId("mark-done")).toHaveClass("!bg-success")

  await userEvent.click(screen.getByTestId("mark-done"))
  await waitFor(() => expect(screen.getByTestId("mark-done")).toHaveTextContent("Mark done"))
})

it("rolls the done state back and toasts when saving fails", async () => {
  mockApi({
    [`POST /api/v1/next_actions/${L4}/nudge_applications/completion`]: () =>
      HttpResponse.json({ error: { code: "server_error", message: "boom" } }, { status: 500 }),
  })
  renderWithProviders(<LeadPanel />, { role: "coordinator", route: route() })

  const done = await screen.findByTestId("mark-done")
  await userEvent.click(done)

  expect(await screen.findByText("Couldn't save — try again")).toBeInTheDocument()
  await waitFor(() => expect(screen.getByTestId("mark-done")).toHaveTextContent("Mark done"))
  expect(screen.getByTestId("mark-done")).toHaveAttribute("data-done", "false")
})

it("names the dialog after the lead so screen readers can announce it", async () => {
  renderWithProviders(<LeadPanel />, { route: route() })

  expect(await screen.findByRole("dialog", { name: "L4 Alpha" })).toBeInTheDocument()
})

it("renames the dialog when Prev/Next moves to another lead", async () => {
  renderWithProviders(<PanelHarness ids={[L4, L3]} />, { route: route() })

  await screen.findByRole("dialog", { name: "L4 Alpha" })
  await userEvent.click(screen.getByRole("button", { name: "Next lead" }))
  expect(await screen.findByRole("dialog", { name: "L3 Alpha" })).toBeInTheDocument()
})

it("a double click triggers one completion mutation", async () => {
  let posts = 0
  mockApi({
    [`POST /api/v1/next_actions/${L4}/nudge_applications/completion`]: async () => {
      posts += 1
      await new Promise((resolve) => setTimeout(resolve, 50))
      return HttpResponse.json({ done: true })
    },
  })
  renderWithProviders(<LeadPanel />, { role: "coordinator", route: route() })

  const done = await screen.findByTestId("mark-done")
  fireEvent.click(done)
  fireEvent.click(done)

  await waitFor(() => expect(posts).toBe(1))
})

it("resyncs the Done label with the server value after a refetch", async () => {
  let serverDone = false
  mockApi({ [`GET /api/v1/leads/${L4}`]: () => HttpResponse.json({ ...detailCoordinator, done: serverDone }) })
  const view = renderWithProviders(<LeadPanel />, { role: "coordinator", route: route() })

  expect(await screen.findByTestId("mark-done")).toHaveTextContent("Mark done")

  // Another session marked the lead done: the next server value is the source of truth.
  serverDone = true
  await act(async () => {
    await view.queryClient.invalidateQueries({ queryKey: ["leads", "detail"] })
  })

  await waitFor(() => expect(screen.getByTestId("mark-done")).toHaveTextContent("Done"))
  expect(screen.getByTestId("mark-done")).toHaveAttribute("data-done", "true")
})

it("is a full-screen sheet with icon-only controls on mobile", async () => {
  renderWithProviders(<LeadPanel />, { viewport: 390, route: route() })

  await screen.findByRole("heading", { name: "L4 Alpha" })
  expect(screen.getByRole("dialog")).toHaveAttribute("data-variant", "full")
  expect(screen.getByRole("button", { name: "Previous lead" }).textContent).toBe("")
  expect(screen.getByRole("button", { name: "Close lead panel" })).toHaveClass("h-8")
})

// jsdom has no layout, so this pins the classes that keep a long value inside its column; the real
// `scrollWidth <= clientWidth` check at 390px runs in e2e (lead-panel.spec.ts).
it("keeps long contact values inside their grid column", async () => {
  mockApi({
    [`GET /api/v1/leads/${L4}`]: () =>
      HttpResponse.json({
        ...detailOwner,
        contact: { ...detailOwner.contact, email: "averyveryverylongaddress.thatcannotwrap@an-extremely-long-domain-name.example.com" },
      }),
  })
  renderWithProviders(<LeadPanel />, { route: route() })

  const cells = within(await screen.findByTestId("top-grid")).getAllByTestId("top-grid-cell")
  expect(cells).toHaveLength(3)
  for (const cell of cells) expect(cell).toHaveClass("min-w-0")

  expect(
    screen.getByText("averyveryverylongaddress.thatcannotwrap@an-extremely-long-domain-name.example.com"),
  ).toHaveClass("truncate", "min-w-0")
})

it("shows a skeleton while the lead is loading", async () => {
  mockApi({
    [`GET /api/v1/leads/${L4}`]: async () => {
      await new Promise((resolve) => setTimeout(resolve, 30))
      return HttpResponse.json(detailOwner)
    },
  })
  renderWithProviders(<LeadPanel />, { route: route() })

  expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0)
  expect(screen.getByRole("heading", { name: "Lead" })).toBeInTheDocument()
  expect(await screen.findByRole("heading", { name: "L4 Alpha" })).toBeInTheDocument()
  expect(screen.queryByTestId("skeleton")).toBeNull()
})

it("Retry refetches the lead after a failure", async () => {
  let calls = 0
  mockApi({
    [`GET /api/v1/leads/${L4}`]: () => {
      calls += 1
      return calls === 1
        ? HttpResponse.json({ error: { code: "server_error", message: "boom" } }, { status: 500 })
        : HttpResponse.json(detailOwner)
    },
  })
  renderWithProviders(<LeadPanel />, { route: route() })

  await userEvent.click(await screen.findByRole("button", { name: "Retry" }))

  expect(await screen.findByRole("heading", { name: "L4 Alpha" })).toBeInTheDocument()
  expect(calls).toBe(2)
})

it("hides Mark done when the lead is in no queue", async () => {
  mockApi({ [`GET /api/v1/leads/${L4}`]: () => HttpResponse.json({ ...detailCoordinator, queue: null }) })
  renderWithProviders(<LeadPanel />, { role: "coordinator", route: route() })

  await screen.findByRole("heading", { name: "L4 Alpha" })
  expect(screen.queryByTestId("mark-done")).toBeNull()
  // Send text / Call are gated by can_contact, not by the queue.
  expect(screen.getByRole("link", { name: "Send text" })).toBeInTheDocument()
})

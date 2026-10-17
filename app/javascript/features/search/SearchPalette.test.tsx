import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HttpResponse } from "msw"
import listFixture from "@contracts/examples/leads/list.json"
import type { LeadCard as LeadCardData } from "@/api/types"
import { mockApi } from "@/test/mockApi"
import { renderWithProviders } from "@/test/renderWithProviders"
import { SearchPalette } from "./SearchPalette"

const L4 = "aaaaaaaa-0000-4000-8000-000000000004" // Dana Ortiz's lead
const L8 = "aaaaaaaa-0000-4000-8000-000000000008" // Priya Shah's lead, second owner-wide match

/** A contract-shaped lead card, overridable per test. */
const card = (over: Partial<LeadCardData> = {}): LeadCardData => ({
  ...(listFixture.leads.find((lead) => lead.id === L4) as LeadCardData),
  ...over,
})

/** Mounts the palette overlay and opens it the way the shell does: Ctrl+K. */
async function openPalette(role: "owner" | "coordinator" = "owner", route = "/") {
  const rendered = renderWithProviders(<SearchPalette />, { role, route })
  fireEvent.keyDown(window, { key: "k", ctrlKey: true })
  const input = await screen.findByRole("combobox", { name: "Search candidates" })
  return { ...rendered, input }
}

it("opens with Ctrl+K, searches after two characters and opens the lead", async () => {
  const user = userEvent.setup()
  const { input, location } = await openPalette()

  // One character is below the two-character gate: the hook is disabled, so there are no options.
  await user.type(input, "l")
  expect(screen.queryAllByRole("option")).toHaveLength(0)

  await user.clear(input)
  await user.type(input, "l4")

  const option = await screen.findByRole("option", { name: /L4 Alpha/ })
  // Each option carries the name, the channel pill and the status pill.
  expect(within(option).getByText("Instagram")).toBeInTheDocument()
  expect(within(option).getByText("Nudge")).toBeInTheDocument()

  await user.click(option)
  await waitFor(() => expect(location().search).toContain(`lead=${L4}`))
  // The palette closes so it never stacks over the lead panel.
  expect(screen.queryByRole("combobox")).toBeNull()
})

it("issues no request before two characters", async () => {
  const user = userEvent.setup()
  let requests = 0
  mockApi({
    "GET /api/v1/leads": () => {
      requests += 1
      return HttpResponse.json({ leads: [], next_cursor: null })
    },
  })
  const { input } = await openPalette()

  await user.type(input, "l")
  expect(requests).toBe(0)
  await user.type(input, "4")
  await waitFor(() => expect(requests).toBe(1))
})

it("moves the active option with the arrow keys and opens it with Enter", async () => {
  const user = userEvent.setup()
  const { input, location } = await openPalette()

  await user.type(input, "alpha")
  const options = await screen.findAllByRole("option")
  expect(options.length).toBeGreaterThan(1)

  expect(input).toHaveAttribute("aria-activedescendant", options[0].id)
  fireEvent.keyDown(input, { key: "ArrowDown" })
  expect(input).toHaveAttribute("aria-activedescendant", options[1].id)
  expect(options[1]).toHaveAttribute("aria-selected", "true")

  fireEvent.keyDown(input, { key: "Enter" })
  await waitFor(() => expect(location().search).toContain(`lead=${L8}`))
  expect(screen.queryByRole("combobox")).toBeNull()
})

it("shows No matches for an empty result and treats % literally", async () => {
  const user = userEvent.setup()
  const { input } = await openPalette()

  // `l%` is two characters, so the search runs. If `%` were a wildcard like in SQL, `l%` would
  // match every "L…" name; as a literal it matches nothing, so the palette shows the empty state.
  await user.type(input, "l%")
  expect(await screen.findByText("No matches")).toBeInTheDocument()
  expect(screen.queryAllByRole("option")).toHaveLength(0)
})

it("closes on Escape", async () => {
  const { input } = await openPalette()
  fireEvent.keyDown(input, { key: "Escape" })
  await waitFor(() => expect(screen.queryByRole("combobox")).toBeNull())
})

it("shows a skeleton while the search is in flight", async () => {
  const user = userEvent.setup()
  // A request that never settles keeps the palette in its loading state.
  mockApi({ "GET /api/v1/leads": () => new Promise<Response>(() => {}) })
  const { input } = await openPalette()

  await user.type(input, "l4")
  await waitFor(() => expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0))
  expect(screen.queryByText("No matches")).toBeNull()
})

it("opens search while a lead panel is open and closes the panel first", async () => {
  const { location } = renderWithProviders(<SearchPalette />, { role: "owner", route: `/?lead=${L4}&tab=screener` })
  expect(location().search).toContain(`lead=${L4}`)

  fireEvent.keyDown(window, { key: "k", ctrlKey: true })
  await screen.findByRole("combobox")
  await waitFor(() => expect(location().search).not.toContain("lead="))
})

it("only searches the coordinator's own leads", async () => {
  const user = userEvent.setup()
  const { input } = await openPalette("coordinator")

  // "alpha" would match every fixture lead for the owner; for Dana it must stop at her two.
  await user.type(input, "alpha")
  expect(await screen.findByRole("option", { name: /L4 Alpha/ })).toBeInTheDocument()
  expect(screen.getByRole("option", { name: /L3 Alpha/ })).toBeInTheDocument()
  for (const name of [/L7 Alpha/, /L8 Alpha/, /L2 Alpha/]) {
    expect(screen.queryByRole("option", { name })).toBeNull()
  }
})

it("does not show or open a stale row inside the debounce window", async () => {
  const user = userEvent.setup()
  const { input, location } = await openPalette()

  await user.type(input, "l4")
  await screen.findByRole("option", { name: /L4 Alpha/ })

  // `useLeadSearch` debounces 200 ms and keys on the debounced value, so right after a change the
  // previous query's data is still cached. It must neither be shown nor be openable with Enter.
  vi.useFakeTimers()
  try {
    fireEvent.change(input, { target: { value: "l5" } })
    await act(async () => {
      vi.advanceTimersByTime(100) // still inside the 200 ms debounce
    })
    expect(screen.queryByRole("option", { name: /L4 Alpha/ })).toBeNull()
    expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0)
    fireEvent.keyDown(input, { key: "Enter" })
    expect(location().search).not.toContain("lead=")
  } finally {
    vi.useRealTimers()
  }
})

it("shows an error with Retry when the request fails, and retry recovers", async () => {
  const user = userEvent.setup()
  mockApi({
    "GET /api/v1/leads": () => HttpResponse.json({ error: { code: "server_error", message: "boom" } }, { status: 500 }),
  })
  const { input } = await openPalette()
  await user.type(input, "l4")

  expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't/i)
  expect(screen.queryByTestId("skeleton")).toBeNull()

  // Retry re-runs the settled query; this time the API answers.
  mockApi({ "GET /api/v1/leads": { leads: [card()], next_cursor: null } })
  await user.click(screen.getByRole("button", { name: "Retry" }))
  expect(await screen.findByRole("option", { name: /L4 Alpha/ })).toBeInTheDocument()
  expect(screen.queryByRole("alert")).toBeNull()
})

it("shows the error state for a network failure too", async () => {
  const user = userEvent.setup()
  mockApi({ "GET /api/v1/leads": () => HttpResponse.error() })
  const { input } = await openPalette()

  await user.type(input, "l4")
  expect(await screen.findByRole("alert")).toBeInTheDocument()
  expect(screen.queryByTestId("skeleton")).toBeNull()
})

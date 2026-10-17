import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HttpResponse } from "msw"
import { mockApi } from "@/test/mockApi"
import { renderWithProviders } from "@/test/renderWithProviders"
import { SearchPalette } from "./SearchPalette"

const L4 = "aaaaaaaa-0000-4000-8000-000000000004" // Dana Ortiz's lead
const L8 = "aaaaaaaa-0000-4000-8000-000000000008" // Priya Shah's lead, second owner-wide match

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

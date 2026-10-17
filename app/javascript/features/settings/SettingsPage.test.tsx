import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import agencyFixture from "@contracts/examples/account/agency.json"
import meOwner from "@contracts/examples/auth/me-owner.json"
import { mockApi } from "@/test/mockApi"
import { renderWithProviders } from "@/test/renderWithProviders"
import { SettingsPage } from "./SettingsPage"

const saved = () => screen.findByText("Saved. Every number now uses this definition.")

it("says what a new definition recomputes before it is saved", async () => {
  renderWithProviders(<SettingsPage />)

  const definition = await screen.findByRole("region", { name: "Definition of qualified" })
  expect(definition).toHaveTextContent(/funnel, channels and cost per qualified/i)
})

it("changing the qualified definition saves immediately with the handoff toast", async () => {
  let body: unknown
  mockApi({
    "PATCH /api/v1/agency": async (request: Request) => {
      body = await request.json()
      return Response.json({ ...agencyFixture, qualified_milestone: "records" })
    },
  })
  renderWithProviders(<SettingsPage />)

  await userEvent.click(await screen.findByRole("radio", { name: /Reached medical records/ }))

  expect(await saved()).toBeInTheDocument()
  expect(body).toEqual({ qualified_milestone: "records" })
})

it("timezone chips save and toast", async () => {
  let body: unknown
  mockApi({
    "PATCH /api/v1/agency": async (request: Request) => {
      body = await request.json()
      return Response.json({ ...agencyFixture, timezone: "America/Chicago" })
    },
  })
  renderWithProviders(<SettingsPage />)

  await userEvent.click(await screen.findByRole("button", { name: "Central" }))

  expect(await screen.findByText("Saved. Times now use this time zone.")).toBeInTheDocument()
  expect(body).toEqual({ timezone: "America/Chicago" })
})

it("keeps the chosen card selected while the save is in flight (optimistic)", async () => {
  mockApi({
    "PATCH /api/v1/agency": async () => {
      await new Promise((resolve) => setTimeout(resolve, 40))
      return Response.json({ ...agencyFixture, qualified_milestone: "records" })
    },
  })
  renderWithProviders(<SettingsPage />)

  const radio = await screen.findByRole("radio", { name: /Reached medical records/ })
  await userEvent.click(radio)
  await waitFor(() => expect(radio).toBeChecked())
})

it("shows the definition radios disabled while saving (single flight) and re-enables them", async () => {
  mockApi({
    "PATCH /api/v1/agency": async () => {
      await new Promise((resolve) => setTimeout(resolve, 40))
      return Response.json({ ...agencyFixture, qualified_milestone: "records" })
    },
  })
  renderWithProviders(<SettingsPage />)

  const radio = await screen.findByRole("radio", { name: /Reached medical records/ })
  await userEvent.click(radio)
  await waitFor(() => expect(radio).toBeDisabled())
  await waitFor(() => expect(radio).toBeEnabled())
})

it("shows a failed definition save under the Definition card, not the Time zone card", async () => {
  mockApi({ "PATCH /api/v1/agency": () => Response.json({ error: { code: "server_error", message: "x" } }, { status: 500 }) })
  renderWithProviders(<SettingsPage />)

  await userEvent.click(await screen.findByRole("radio", { name: /Reached medical records/ }))

  const definition = screen.getByRole("region", { name: "Definition of qualified" })
  expect(await within(definition).findByRole("alert")).toHaveTextContent("We could not save that. Try again.")
  expect(within(screen.getByRole("region", { name: "Time zone" })).queryByRole("alert")).toBeNull()
})

it("shows a failed time zone save under the Time zone card, not the Definition card", async () => {
  mockApi({ "PATCH /api/v1/agency": () => Response.json({ error: { code: "server_error", message: "x" } }, { status: 500 }) })
  renderWithProviders(<SettingsPage />)

  await userEvent.click(await screen.findByRole("button", { name: "Central" }))

  const timezone = screen.getByRole("region", { name: "Time zone" })
  expect(await within(timezone).findByRole("alert")).toHaveTextContent("We could not save that. Try again.")
  expect(within(screen.getByRole("region", { name: "Definition of qualified" })).queryByRole("alert")).toBeNull()
})

it("clears a failed save once the same card is retried", async () => {
  let fail = true
  mockApi({
    "PATCH /api/v1/agency": async (request: Request) => {
      if (fail) return Response.json({ error: { code: "server_error", message: "x" } }, { status: 500 })
      const body = (await request.json()) as { qualified_milestone?: string }
      return Response.json({ ...agencyFixture, ...body })
    },
  })
  renderWithProviders(<SettingsPage />)

  await userEvent.click(await screen.findByRole("radio", { name: /Reached medical records/ }))
  const definition = screen.getByRole("region", { name: "Definition of qualified" })
  expect(await within(definition).findByRole("alert")).toBeInTheDocument()

  fail = false
  await userEvent.click(screen.getByRole("radio", { name: /Been accepted/ }))
  await waitFor(() => expect(within(definition).queryByRole("alert")).toBeNull())
  expect(await screen.findByText("Saved. Every number now uses this definition.")).toBeInTheDocument()
})

it("is one 720px column with the three cards", async () => {
  renderWithProviders(<SettingsPage />)

  const definition = await screen.findByRole("heading", { level: 2, name: "Definition of qualified" })
  expect(definition).toBeInTheDocument()
  expect(screen.getByRole("heading", { level: 2, name: "Time zone" })).toBeInTheDocument()
  expect(screen.getByRole("heading", { level: 2, name: "Team" })).toBeInTheDocument()
  expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(3)
  // The page body is the 720px column described by the handoff (every card is a direct child of it).
  expect(definition.closest("section")?.parentElement).toHaveClass("max-w-[720px]")
})

it("keeps a time zone that is not one of the four options selected", async () => {
  mockApi({
    "GET /api/v1/me": () => Response.json({ ...meOwner, agency: { ...meOwner.agency, timezone: "Europe/London" } }),
  })
  renderWithProviders(<SettingsPage />)

  // The extra zone is offered as a chip and reads as the current choice, so nothing looks unset.
  const extra = await screen.findByRole("button", { name: "Europe/London" })
  expect(extra).toHaveAttribute("aria-pressed", "true")
  expect(screen.getByRole("button", { name: "Pacific" })).toHaveAttribute("aria-pressed", "false")

  // Picking one of the four still saves.
  let body: unknown
  mockApi({
    "PATCH /api/v1/agency": async (request: Request) => {
      body = await request.json()
      return Response.json({ ...agencyFixture, timezone: "America/Chicago" })
    },
  })
  await userEvent.click(screen.getByRole("button", { name: "Central" }))
  expect(await screen.findByText("Saved. Times now use this time zone.")).toBeInTheDocument()
  expect(body).toEqual({ timezone: "America/Chicago" })
})

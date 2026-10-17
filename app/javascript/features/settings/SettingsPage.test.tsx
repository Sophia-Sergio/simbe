import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import agencyFixture from "@contracts/examples/account/agency.json"
import { mockApi } from "@/test/mockApi"
import { renderWithProviders } from "@/test/renderWithProviders"
import { SettingsPage } from "./SettingsPage"

const saved = () => screen.findByText("Saved. Every number now uses this definition.")

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

it("surfaces a failed save inline", async () => {
  mockApi({ "PATCH /api/v1/agency": () => Response.json({ error: { code: "server_error", message: "x" } }, { status: 500 }) })
  renderWithProviders(<SettingsPage />)

  await userEvent.click(await screen.findByRole("radio", { name: /Reached medical records/ }))
  expect(await screen.findByRole("alert")).toHaveTextContent("We could not save that. Try again.")
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

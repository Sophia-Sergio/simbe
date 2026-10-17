import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import meCoordinator from "@contracts/examples/auth/me-coordinator.json"
import { mockApi } from "@/test/mockApi"
import { renderWithProviders } from "@/test/renderWithProviders"
import { AcceptInvitePage } from "./AcceptInvitePage"

const route = "/invite/tok-123"
const path = "/invite/:token"

const fill = async (name: string, password: string) => {
  await userEvent.type(await screen.findByLabelText("Your name"), name)
  await userEvent.type(screen.getByLabelText("Password"), password)
}

it("shows the agency and email, then creates the account", async () => {
  // The redirect is a full load (`window.location.assign`), which jsdom cannot observe; the e2e owns that
  // assertion. Here we check the request the page sends and that it fails loudly otherwise.
  let body: unknown
  mockApi({
    "POST /api/v1/invitations/:token/accept": async (request: Request) => {
      body = await request.json()
      return Response.json(meCoordinator, { status: 201 })
    },
  })
  renderWithProviders(<AcceptInvitePage />, { route, path, role: null })

  expect(await screen.findByText(/Harbor Surrogacy/)).toBeInTheDocument()
  expect(screen.getByLabelText("Email")).toHaveValue("maya@harbor.test")

  await fill("Maya Chen", "long-enough-pass")
  await userEvent.click(screen.getByRole("button", { name: "Create account" }))

  await waitFor(() => expect(body).toEqual({ name: "Maya Chen", password: "long-enough-pass" }))
  expect(screen.queryByRole("alert")).toBeNull()
})

it("needs a name and a password of at least 10 characters", async () => {
  renderWithProviders(<AcceptInvitePage />, { route, path, role: null })

  const create = await screen.findByRole("button", { name: "Create account" })
  expect(create).toBeDisabled()
  await userEvent.type(screen.getByLabelText("Your name"), "Maya Chen")
  await userEvent.type(screen.getByLabelText("Password"), "short")
  expect(create).toBeDisabled()
  await userEvent.type(screen.getByLabelText("Password"), "-enough")
  await waitFor(() => expect(create).toBeEnabled())
})

it("shows the friendly message for an expired invitation", async () => {
  renderWithProviders(<AcceptInvitePage />, { route: "/invite/expired", path, role: null })

  expect(await screen.findByText("This invitation has expired. Ask your agency owner for a new one.")).toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "Create account" })).toBeNull()
})

it("shows the friendly message when the token dies before accept", async () => {
  mockApi({
    "POST /api/v1/invitations/:token/accept": () =>
      Response.json({ error: { code: "invitation_expired", message: "This invitation has expired" } }, { status: 410 }),
  })
  renderWithProviders(<AcceptInvitePage />, { route, path, role: null })

  await fill("Maya Chen", "long-enough-pass")
  await userEvent.click(screen.getByRole("button", { name: "Create account" }))

  expect(await screen.findByText("This invitation has expired. Ask your agency owner for a new one.")).toBeInTheDocument()
})

it("surfaces a rejection from the API inline", async () => {
  mockApi({
    "POST /api/v1/invitations/:token/accept": () =>
      Response.json({ error: { code: "weak_password", message: "Password must be at least 10 characters" } }, { status: 422 }),
  })
  renderWithProviders(<AcceptInvitePage />, { route, path, role: null })

  await fill("Maya Chen", "long-enough-pass")
  await userEvent.click(screen.getByRole("button", { name: "Create account" }))

  expect(await screen.findByRole("alert")).toHaveTextContent("Use at least 10 characters.")
})

it("never stores the token or the password", async () => {
  renderWithProviders(<AcceptInvitePage />, { route, path, role: null })
  await fill("Maya Chen", "long-enough-pass")

  const stored = JSON.stringify({ ...localStorage })
  expect(stored).not.toContain("tok-123")
  expect(stored).not.toContain("long-enough-pass")
})

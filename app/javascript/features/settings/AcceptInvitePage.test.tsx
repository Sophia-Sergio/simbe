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

/** `aria-describedby` is a list (Field adds the hint's id too), so resolve every id it points at. */
const describedText = (element: HTMLElement) =>
  (element.getAttribute("aria-describedby") ?? "")
    .split(/\s+/)
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ")

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

it("blocks an empty form and reports a short password on the password field", async () => {
  let calls = 0
  mockApi({
    "POST /api/v1/invitations/:token/accept": () => {
      calls += 1
      return Response.json(meCoordinator, { status: 201 })
    },
  })
  renderWithProviders(<AcceptInvitePage />, { route, path, role: null })

  const create = await screen.findByRole("button", { name: "Create account" })
  expect(create).toBeDisabled()

  await fill("Maya Chen", "short")
  expect(create).toBeEnabled()
  await userEvent.click(create)

  const password = await screen.findByLabelText("Password")
  await waitFor(() => expect(password).toHaveFocus())
  expect(password).toHaveAttribute("aria-invalid", "true")
  expect(describedText(password)).toContain("Use at least 10 characters.")
  expect(calls).toBe(0) // rejected before the request
})

it("reports a missing name on the name field", async () => {
  renderWithProviders(<AcceptInvitePage />, { route, path, role: null })

  // Whitespace alone is not a name; the button is enabled because the field is not empty.
  await fill("   ", "long-enough-pass")
  await userEvent.click(screen.getByRole("button", { name: "Create account" }))

  const name = await screen.findByLabelText("Your name")
  await waitFor(() => expect(name).toHaveFocus())
  expect(name).toHaveAttribute("aria-invalid", "true")
  expect(describedText(name)).toContain("Enter your name.")
})

it("shows the password minimum while the form is empty", async () => {
  renderWithProviders(<AcceptInvitePage />, { route, path, role: null })

  expect(await screen.findByText("At least 10 characters")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Create account" })).toBeDisabled()
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

it("puts a weak-password rejection on the password field and focuses it", async () => {
  mockApi({
    "POST /api/v1/invitations/:token/accept": () =>
      Response.json({ error: { code: "weak_password", message: "Password must be at least 10 characters" } }, { status: 422 }),
  })
  renderWithProviders(<AcceptInvitePage />, { route, path, role: null })

  await fill("Maya Chen", "long-enough-pass")
  await userEvent.click(screen.getByRole("button", { name: "Create account" }))

  const password = await screen.findByLabelText("Password")
  await waitFor(() => expect(password).toHaveFocus())
  expect(password).toHaveAttribute("aria-invalid", "true")
  expect(describedText(password)).toContain("Use at least 10 characters.")
})

it("surfaces a rejection the API does not tie to a field inline", async () => {
  mockApi({
    "POST /api/v1/invitations/:token/accept": () =>
      Response.json({ error: { code: "server_error", message: "Something went wrong" } }, { status: 500 }),
  })
  renderWithProviders(<AcceptInvitePage />, { route, path, role: null })

  await fill("Maya Chen", "long-enough-pass")
  await userEvent.click(screen.getByRole("button", { name: "Create account" }))

  expect(await screen.findByRole("alert")).toHaveTextContent("We could not create your account. Try again.")
})

it("never stores the token or the password", async () => {
  renderWithProviders(<AcceptInvitePage />, { route, path, role: null })
  await fill("Maya Chen", "long-enough-pass")

  const stored = JSON.stringify({ ...localStorage })
  expect(stored).not.toContain("tok-123")
  expect(stored).not.toContain("long-enough-pass")
})

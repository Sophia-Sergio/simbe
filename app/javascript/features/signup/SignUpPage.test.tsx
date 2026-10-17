import { fireEvent, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HttpResponse } from "msw"
import meOwner from "@contracts/examples/auth/me-owner.json"
import { db } from "@/mocks/db"
import { mockApi } from "@/test/mockApi"
import { renderWithProviders } from "@/test/renderWithProviders"
import { SignUpPage } from "./SignUpPage"
import type { Me } from "@/api/types"

const me = meOwner as Me

/** Fill step 1 and continue; the promise resolves once step 2 is on screen. */
async function reachAgencyStep(email = "erin@new.test") {
  // The page resolves the session before it renders the wizard, so wait for step 1 first.
  await screen.findByLabelText("Your name")
  await userEvent.type(screen.getByLabelText("Your name"), "Erin Walsh")
  await userEvent.type(screen.getByLabelText("Work email"), email)
  await userEvent.type(screen.getByLabelText("Password"), "long-enough-pass")
  await userEvent.click(screen.getByRole("button", { name: "Continue" }))
  await screen.findByLabelText("Agency name")
}

it("disables Continue until the account step is valid", async () => {
  renderWithProviders(<SignUpPage />, { role: null })
  const next = await screen.findByRole("button", { name: "Continue" })

  expect(next).toBeDisabled()
  await userEvent.type(screen.getByLabelText("Your name"), "Erin Walsh")
  await userEvent.type(screen.getByLabelText("Work email"), "erin@new.test")
  await userEvent.type(screen.getByLabelText("Password"), "short")
  expect(next).toBeDisabled()

  await userEvent.clear(screen.getByLabelText("Password"))
  await userEvent.type(screen.getByLabelText("Password"), "long-enough-pass")
  expect(next).toBeEnabled()
})

it("submits account and agency at the end of step 2, then lands on Ad accounts", async () => {
  const bodies: unknown[] = []
  mockApi({
    "POST /api/v1/signup": async (request: Request) => {
      bodies.push(await request.json())
      db.session = { email: "erin@new.test", role: "owner" }
      return HttpResponse.json(me, { status: 201 })
    },
  })
  renderWithProviders(<SignUpPage />, { role: null })

  await reachAgencyStep()
  await userEvent.type(screen.getByLabelText("Agency name"), "New Agency")
  await userEvent.click(screen.getByRole("button", { name: "Mountain" }))
  await userEvent.click(screen.getByRole("radio", { name: /reached medical records/i }))
  await userEvent.click(screen.getByRole("button", { name: "Continue" }))

  expect(await screen.findByRole("heading", { name: "Connect your ad accounts" })).toBeInTheDocument()
  expect(bodies).toEqual([
    {
      user: { name: "Erin Walsh", email: "erin@new.test", password: "long-enough-pass" },
      agency: { name: "New Agency", timezone: "America/Denver", qualified_milestone: "records" },
    },
  ])
})

it("hides Back once the account exists, so signup can never be submitted twice", async () => {
  let posts = 0
  mockApi({
    "POST /api/v1/signup": () => {
      posts += 1
      db.session = { email: "erin@new.test", role: "owner" }
      return HttpResponse.json(me, { status: 201 })
    },
  })
  renderWithProviders(<SignUpPage />, { role: null })

  await reachAgencyStep()
  // Step 2 is the last step the user may walk back from.
  expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument()

  await userEvent.type(screen.getByLabelText("Agency name"), "New Agency")
  await userEvent.click(screen.getByRole("button", { name: "Continue" }))
  await screen.findByRole("heading", { name: "Connect your ad accounts" })

  for (const [heading, button] of [
    ["Connect your ad accounts", "Continue"],
    ["Load your data", "Continue"],
    ["Invite your team", null],
  ] as const) {
    expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument()
    expect(screen.queryByLabelText("Your name")).not.toBeInTheDocument()
    if (button) await userEvent.click(screen.getByRole("button", { name: button }))
  }

  // One account per visit: no step above 2 can re-post the signup.
  expect(posts).toBe(1)
})

it("redirects a signed-in owner whose agency already has data to their home", async () => {
  const { location } = renderWithProviders(<SignUpPage />, { role: "owner", route: "/signup" })

  await waitFor(() => expect(location().pathname).toBe("/"))
  expect(screen.queryByLabelText("Your name")).not.toBeInTheDocument()
})

it("sends a signed-in coordinator to their own home instead of the wizard", async () => {
  const { location } = renderWithProviders(<SignUpPage />, { role: "coordinator", route: "/signup" })

  await waitFor(() => expect(location().pathname).toBe("/next-actions"))
  expect(screen.queryByLabelText("Your name")).not.toBeInTheDocument()
})

it("resumes an unfinished onboarding at step 3 for a signed-in owner", async () => {
  mockApi({ "GET /api/v1/snapshots/current": { snapshot: null, pending: null, files: [] } })
  renderWithProviders(<SignUpPage />, { role: "owner", route: "/signup" })

  expect(await screen.findByRole("heading", { name: "Connect your ad accounts" })).toBeInTheDocument()
  expect(screen.getByText("Step 3 of 5")).toBeInTheDocument()
  expect(screen.queryByLabelText("Your name")).not.toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument()
})

it("explains a malformed email and a too-short password once the fields are left", async () => {
  renderWithProviders(<SignUpPage />, { role: null })
  await screen.findByLabelText("Your name")

  // Leaving a field (nothing after the password on step 1 is focusable, so blur explicitly).
  const email = screen.getByLabelText("Work email")
  await userEvent.type(email, "not-an-email")
  fireEvent.blur(email)
  expect(await screen.findByText("Enter a valid work email")).toBeInTheDocument()
  expect(email).toHaveAttribute("aria-invalid", "true")

  const password = screen.getByLabelText("Password")
  await userEvent.type(password, "short")
  fireEvent.blur(password)
  expect(await screen.findByText("Use at least 10 characters")).toBeInTheDocument()
  expect(password).toHaveAttribute("aria-invalid", "true")

  // Fixing the value clears the message again.
  await userEvent.type(password, "long-enough-pass")
  expect(screen.queryByText("Use at least 10 characters")).not.toBeInTheDocument()
})

it("explains an empty agency name once the field is left", async () => {
  renderWithProviders(<SignUpPage />, { role: null })
  await reachAgencyStep()

  const name = screen.getByLabelText("Agency name")
  await userEvent.type(name, "x")
  await userEvent.clear(name)
  await userEvent.tab()

  expect(await screen.findByText("Enter your agency name")).toBeInTheDocument()
  expect(name).toHaveAttribute("aria-invalid", "true")
  expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled()
})

it("returns to step 1 with the weak_password message the server sends", async () => {
  mockApi({
    "POST /api/v1/signup": () =>
      HttpResponse.json({ error: { code: "weak_password", message: "Password must be at least 10 characters" } }, { status: 422 }),
  })
  renderWithProviders(<SignUpPage />, { role: null })

  await reachAgencyStep()
  await userEvent.type(screen.getByLabelText("Agency name"), "Harbor")
  await userEvent.click(screen.getByRole("button", { name: "Continue" }))

  expect(await screen.findByText("Password must be at least 10 characters")).toBeInTheDocument()
  expect(screen.getByLabelText("Password")).toHaveAttribute("aria-invalid", "true")
  expect(screen.getByRole("heading", { name: "Create your account" })).toBeInTheDocument()
})

it("shows email_taken and returns the user to step 1 with the message", async () => {
  renderWithProviders(<SignUpPage />, { role: null })

  await reachAgencyStep("taken@x.test")
  await userEvent.type(screen.getByLabelText("Agency name"), "Harbor")
  await userEvent.click(screen.getByRole("button", { name: "Continue" }))

  expect(await screen.findByText("That email already has an account")).toBeInTheDocument()
  expect(screen.getByLabelText("Your name")).toHaveValue("Erin Walsh")
})

it("preselects the recommended definition with the selected card styling", async () => {
  renderWithProviders(<SignUpPage />, { role: null })
  await reachAgencyStep()

  const recommended = screen.getByRole("radio", { name: /attended a consult/i })
  expect(recommended).toBeChecked()
  expect(screen.getByText("Recommended")).toBeInTheDocument()
  expect(recommended.closest("label")?.className).toContain("bg-brand-tint")
})

it("posts signup once when Continue is double-clicked on step 2", async () => {
  let posts = 0
  mockApi({
    "POST /api/v1/signup": () => {
      posts += 1
      db.session = { email: "erin@new.test", role: "owner" }
      return HttpResponse.json(me, { status: 201 })
    },
  })
  renderWithProviders(<SignUpPage />, { role: null })

  await reachAgencyStep()
  await userEvent.type(screen.getByLabelText("Agency name"), "New Agency")
  const next = screen.getByRole("button", { name: "Continue" })
  fireEvent.click(next)
  fireEvent.click(next)

  await waitFor(() => expect(posts).toBe(1))
  expect(await screen.findByRole("heading", { name: "Connect your ad accounts" })).toBeInTheDocument()
})

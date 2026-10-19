import { fireEvent, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HttpResponse, http } from "msw"
import meOwner from "@contracts/examples/auth/me-owner.json"
import snapshotCurrent from "@contracts/examples/snapshots/current.json"
import { EXPORT_FILES } from "@/components/shared/FileChecklist"
import { db } from "@/mocks/db"
import { server } from "@/mocks/server"
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

it("submits account and agency at the end of step 2, then lands on Load your data", async () => {
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

  expect(await screen.findByRole("heading", { name: "Load your data" })).toBeInTheDocument()
  expect(bodies).toEqual([
    {
      user: { name: "Erin Walsh", email: "erin@new.test", password: "long-enough-pass" },
      agency: { name: "New Agency", timezone: "America/Denver", qualified_milestone: "records" },
    },
  ])
})

it("never offers steps 1–2 once the account exists, so signup can never be submitted twice", async () => {
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
  await screen.findByRole("heading", { name: "Load your data" })

  for (const [heading, back, button] of [
    ["Load your data", false, "Continue"],
    ["Invite your team", true, null],
  ] as const) {
    expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument()
    // Back walks among steps 3–4 only; step 3 has nothing before it to go back to.
    expect(screen.queryByRole("button", { name: "Back" }) !== null).toBe(back)
    // The stepper never makes steps 1–2 clickable.
    expect(screen.queryByRole("button", { name: /^Account:/ })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /^Agency:/ })).not.toBeInTheDocument()
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

  expect(await screen.findByRole("heading", { name: "Load your data" })).toBeInTheDocument()
  expect(screen.getByText("Load data: current")).toBeInTheDocument()
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

it("moves focus to the step heading when the step changes", async () => {
  renderWithProviders(<SignUpPage />, { role: null })

  await reachAgencyStep()
  expect(await screen.findByRole("heading", { name: "Set up your agency" })).toHaveFocus()
})

it("summarises the problem and focuses the offending field after a rejected submit", async () => {
  renderWithProviders(<SignUpPage />, { role: null })

  await reachAgencyStep("taken@x.test")
  await userEvent.type(screen.getByLabelText("Agency name"), "Harbor")
  await userEvent.click(screen.getByRole("button", { name: "Continue" }))

  expect(await screen.findByText("Check the highlighted fields below.")).toBeInTheDocument()
  await waitFor(() => expect(screen.getByLabelText("Work email")).toHaveFocus())
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
  expect(await screen.findByRole("heading", { name: "Load your data" })).toBeInTheDocument()
})

/** Submit step 2 with the server rejecting the agency with `message`. */
async function submitRejectedAgency(message: string) {
  mockApi({
    "POST /api/v1/signup": () => HttpResponse.json({ error: { code: "invalid_agency", message } }, { status: 422 }),
  })
  renderWithProviders(<SignUpPage />, { role: null })
  await reachAgencyStep()
  await userEvent.type(screen.getByLabelText("Agency name"), "Harbor")
  await userEvent.click(screen.getByRole("button", { name: "Continue" }))
}

it("shows a time zone problem under the time zone chips, not under the agency name", async () => {
  await submitRejectedAgency("Pick a supported time zone")

  const alert = await screen.findByText("Pick a supported time zone")
  expect(alert).toHaveAttribute("role", "alert")
  expect(alert.previousElementSibling).toBe(screen.getByRole("group", { name: "Time zone" }))
  expect(screen.getByLabelText("Agency name")).not.toHaveAttribute("aria-invalid", "true")
})

it("shows a definition problem under the qualified cards, not under the agency name", async () => {
  await submitRejectedAgency("Pick a definition of qualified")

  const alert = await screen.findByText("Pick a definition of qualified")
  expect(alert).toHaveAttribute("role", "alert")
  expect(alert.previousElementSibling).toBe(screen.getByRole("radiogroup", { name: "Definition of qualified" }))
  expect(screen.getByLabelText("Agency name")).not.toHaveAttribute("aria-invalid", "true")
})

it("splits a combined message so each input gets its own", async () => {
  await submitRejectedAgency("Pick a supported time zone and a definition of qualified")

  const zone = await screen.findByText("Pick a supported time zone")
  const definition = screen.getByText("Pick a definition of qualified")
  expect(zone.previousElementSibling).toBe(screen.getByRole("group", { name: "Time zone" }))
  expect(definition.previousElementSibling).toBe(screen.getByRole("radiogroup", { name: "Definition of qualified" }))
})

it("keeps any other agency problem under the agency name", async () => {
  await submitRejectedAgency("That agency name can't be used - try a different one")

  expect(await screen.findByText("That agency name can't be used - try a different one")).toBeInTheDocument()
  expect(screen.getByLabelText("Agency name")).toHaveAttribute("aria-invalid", "true")
  expect(screen.queryByText("Pick a supported time zone")).not.toBeInTheDocument()
})


it("moves among steps 3–4 with Back and the stepper, keeping the Load data step alive", async () => {
  mockApi({ "GET /api/v1/snapshots/current": { snapshot: null, pending: null, files: [] } })
  renderWithProviders(<SignUpPage />, { role: "owner", route: "/signup" })
  await screen.findByRole("heading", { name: "Load your data" })

  await userEvent.click(screen.getByRole("button", { name: "Continue" }))
  expect(screen.getByRole("heading", { name: "Invite your team" })).toHaveFocus()

  // Step 3 stays mounted (hidden) so an upload in progress is not cancelled by leaving it.
  expect(document.querySelector('[hidden] input[aria-label="CSV files"]')).not.toBeNull()

  await userEvent.click(screen.getByRole("button", { name: "Back" }))
  expect(screen.getByRole("heading", { name: "Load your data" })).toHaveFocus()
  expect(screen.getByLabelText("CSV files")).toBeInTheDocument()

  await userEvent.click(screen.getByRole("button", { name: "Team: upcoming" }))
  expect(screen.getByRole("heading", { name: "Invite your team" })).toBeInTheDocument()
})

/** A signed-in owner at step 3 who has uploaded the seven files and is looking at the review. */
async function reachUploadReview() {
  mockApi({ "GET /api/v1/snapshots/current": { snapshot: null, pending: null, files: [] } })
  server.use(
    http.post("/api/v1/snapshot_uploads", () =>
      HttpResponse.json(
        { id: "u-test", status: "validating", progress: { phase: "storing", pct: 0 }, report: null, snapshot: null, error: null },
        { status: 201 },
      ),
    ),
    http.get("/api/v1/snapshot_uploads/:id", () =>
      HttpResponse.json({
        id: "u-test",
        status: "validated",
        progress: null,
        report: {
          ok: true,
          errors: [],
          warnings: [],
          ignored: [],
          diff: { leads: { current: 0, incoming: 10, delta: 10 } },
          checks: { files_matched: "7 of 7", duplicates: 0, screener_encrypted: true },
        },
        snapshot: null,
        error: null,
      }),
    ),
    http.delete("/api/v1/snapshot_uploads/:id", () => new HttpResponse(null, { status: 204 })),
  )
  renderWithProviders(<SignUpPage />, { role: "owner", route: "/signup" })
  await screen.findByRole("heading", { name: "Load your data" })
  const files = EXPORT_FILES.map((name) => new File(["a,b\n1,2\n"], name, { type: "text/csv" }))
  await userEvent.upload(screen.getByLabelText(/csv files/i), files)
  await screen.findByText("Review changes")
}

it("warns before leaving step 3 with files uploaded but not loaded", async () => {
  await reachUploadReview()

  await userEvent.click(screen.getByRole("button", { name: "Continue" }))
  expect(screen.getByText(/your data hasn't been loaded yet/i)).toBeInTheDocument()
  expect(screen.getByRole("heading", { name: "Load your data" })).toBeInTheDocument()

  await userEvent.click(screen.getByRole("button", { name: "Stay and load" }))
  expect(screen.queryByText(/your data hasn't been loaded yet/i)).not.toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Load data" })).toBeInTheDocument()

  await userEvent.click(screen.getByRole("button", { name: "Continue" }))
  await userEvent.click(screen.getByRole("button", { name: "Continue without loading" }))
  expect(screen.getByRole("heading", { name: "Invite your team" })).toBeInTheDocument()
}, 20000)

it("asks the same when skipping or jumping ahead with the stepper", async () => {
  await reachUploadReview()

  await userEvent.click(screen.getByRole("button", { name: "Skip for now" }))
  expect(screen.getByText(/your data hasn't been loaded yet/i)).toBeInTheDocument()
  await userEvent.click(screen.getByRole("button", { name: "Stay and load" }))

  await userEvent.click(screen.getByRole("button", { name: "Team: upcoming" }))
  expect(screen.getByText(/your data hasn't been loaded yet/i)).toBeInTheDocument()
  expect(screen.getByRole("heading", { name: "Load your data" })).toBeInTheDocument()
}, 20000)

it("does not warn once the upload was cancelled or when nothing was uploaded", async () => {
  await reachUploadReview()

  await userEvent.click(screen.getByRole("button", { name: "Cancel" }))
  await userEvent.click(await screen.findByRole("button", { name: "Continue" }))
  expect(screen.getByRole("heading", { name: "Invite your team" })).toBeInTheDocument()
}, 20000)

it("stays in the wizard when the data finishes loading, instead of jumping to the dashboard", async () => {
  let loaded = false
  mockApi({
    "GET /api/v1/snapshots/current": () =>
      HttpResponse.json(loaded ? snapshotCurrent : { snapshot: null, pending: null, files: [] }),
  })
  const { queryClient, location } = renderWithProviders(<SignUpPage />, { role: "owner", route: "/signup" })
  await screen.findByRole("heading", { name: "Load your data" })

  // The load commits: /snapshots/current now has a snapshot.
  loaded = true
  await queryClient.invalidateQueries({ queryKey: ["snapshot"] })

  await waitFor(() => expect(queryClient.getQueryData<{ snapshot: unknown }>(["snapshot"])?.snapshot).toBeTruthy())
  expect(location().pathname).toBe("/signup")
  expect(screen.getByRole("heading", { name: "Load your data" })).toBeInTheDocument()
  await userEvent.click(screen.getByRole("button", { name: "Continue" }))
  expect(screen.getByRole("heading", { name: "Invite your team" })).toBeInTheDocument()
})

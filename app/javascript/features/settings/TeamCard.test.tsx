import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { mockApi } from "@/test/mockApi"
import { renderWithProviders } from "@/test/renderWithProviders"
import { TeamCard } from "./TeamCard"

const invite = async (email: string, coordinator: string) => {
  await userEvent.type(await screen.findByLabelText("Email"), email)
  await userEvent.type(screen.getByLabelText("Coordinator"), coordinator)
  await userEvent.click(screen.getByRole("button", { name: "Invite" }))
}

/** `aria-describedby` is a list, so resolve every id it points at. */
const describedText = (element: HTMLElement) =>
  (element.getAttribute("aria-describedby") ?? "")
    .split(/\s+/)
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ")

it("lists the team with role pills and the invite footer", async () => {
  renderWithProviders(<TeamCard />)

  expect(await screen.findByText("Erin Walsh")).toBeInTheDocument()
  expect(screen.getByText("Dana Ortiz")).toBeInTheDocument()
  // Scoped to the list: the invite footer's field label is also "Coordinator".
  const list = screen.getByRole("list")
  expect(within(list).getByText("Owner")).toBeInTheDocument()
  expect(within(list).getByText("Coordinator")).toBeInTheDocument()
  expect(within(list).getByText("Invited")).toBeInTheDocument()
  expect(screen.getByText("maya@harbor.test")).toBeInTheDocument()
  // The invite footer lives on `bg-app`.
  expect(screen.getByRole("button", { name: "Invite" }).closest("div.bg-app")).not.toBeNull()
})

it("invites a coordinator, toasts and offers the accept link the response carried", async () => {
  const user = userEvent.setup()
  renderWithProviders(<TeamCard />)

  await user.type(await screen.findByLabelText("Email"), "jess@harbor.test")
  await user.type(screen.getByLabelText("Coordinator"), "Jess Kim")
  await user.click(screen.getByRole("button", { name: "Invite" }))

  expect(await screen.findByText("Invitation sent")).toBeInTheDocument()
  await user.click(await screen.findByRole("button", { name: "Copy invite link" }))
  expect(await screen.findByText("Invite link copied")).toBeInTheDocument()
  expect(await navigator.clipboard.readText()).toMatch(/^http:\/\/localhost:5173\/invite\//)
})

it("shows the valid names when the coordinator is unknown", async () => {
  mockApi({
    "POST /api/v1/invitations": () =>
      Response.json(
        { error: { code: "unknown_coordinator", message: "Pick an existing coordinator" }, valid_names: ["Dana Ortiz", "Jess Kim", "Priya Shah"] },
        { status: 422 },
      ),
  })
  renderWithProviders(<TeamCard />)

  await invite("nobody@harbor.test", "Nobody")

  expect(await screen.findByRole("alert")).toHaveTextContent("Pick one of: Dana Ortiz, Jess Kim, Priya Shah")
})

it("checks the email format locally, links the error to the field and focuses it", async () => {
  let calls = 0
  mockApi({
    "POST /api/v1/invitations": () => {
      calls += 1
      return Response.json({ error: { code: "invalid_email", message: "A valid email is required" } }, { status: 422 })
    },
  })
  renderWithProviders(<TeamCard />)

  await invite("not-an-email", "Jess Kim")

  const email = await screen.findByLabelText("Email")
  await waitFor(() => expect(email).toHaveFocus())
  expect(email).toHaveAttribute("aria-invalid", "true")
  expect(describedText(email)).toContain("Enter a valid email address.")
  expect(calls).toBe(0) // rejected before the request
})

it("puts an unknown coordinator on the coordinator field and focuses it", async () => {
  mockApi({
    "POST /api/v1/invitations": () =>
      Response.json(
        { error: { code: "unknown_coordinator", message: "Pick an existing coordinator" }, valid_names: ["Dana Ortiz", "Jess Kim"] },
        { status: 422 },
      ),
  })
  renderWithProviders(<TeamCard />)

  await invite("nobody@harbor.test", "Nobody")

  const coordinator = await screen.findByLabelText("Coordinator")
  await waitFor(() => expect(coordinator).toHaveFocus())
  expect(coordinator).toHaveAttribute("aria-invalid", "true")
  expect(describedText(coordinator)).toContain("Pick one of: Dana Ortiz, Jess Kim")
})

it("returns focus to the email field after a successful invite", async () => {
  renderWithProviders(<TeamCard />)

  await invite("jess@harbor.test", "Jess Kim")

  await screen.findByText("Invitation sent")
  await waitFor(() => expect(screen.getByLabelText("Email")).toHaveFocus())
})

it("returns focus to the Revoke trigger when the confirmation is cancelled", async () => {
  renderWithProviders(<TeamCard />)

  await screen.findByText("maya@harbor.test")
  await userEvent.click(screen.getByRole("button", { name: "Revoke" }))
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }))

  await waitFor(() => expect(screen.getByRole("button", { name: "Revoke" })).toHaveFocus())
})

it("moves focus somewhere useful after a revoke removes the row", async () => {
  renderWithProviders(<TeamCard />)

  await screen.findByText("maya@harbor.test")
  await userEvent.click(screen.getByRole("button", { name: "Revoke" }))
  await userEvent.click(within(screen.getByRole("group")).getByRole("button", { name: "Revoke" }))

  await waitFor(() => expect(screen.queryByText("maya@harbor.test")).toBeNull())
  await waitFor(() => expect(screen.getByLabelText("Email")).toHaveFocus())
})

it("revokes a pending invitation through an inline confirmation", async () => {
  renderWithProviders(<TeamCard />)

  await screen.findByText("maya@harbor.test")
  await userEvent.click(screen.getByRole("button", { name: "Revoke" }))
  expect(screen.getByText("Revoke the invitation for maya@harbor.test?")).toBeInTheDocument()
  expect(screen.queryByRole("dialog")).toBeNull() // inline, never an overlay on an overlay

  await userEvent.click(within(screen.getByRole("group")).getByRole("button", { name: "Revoke" }))
  await waitFor(() => expect(screen.queryByText("maya@harbor.test")).toBeNull())
})

it("revokes the invitation it just sent (a mistyped email can be undone)", async () => {
  renderWithProviders(<TeamCard />)

  await invite("typo@harbor.test", "Jess Kim")
  await screen.findByText("Invitation sent")

  const row = screen.getByText("typo@harbor.test").closest("li") as HTMLElement
  // Both actions stay available on the just-sent row, not just Copy invite link.
  expect(within(row).getByRole("button", { name: "Copy invite link" })).toBeInTheDocument()
  await userEvent.click(within(row).getByRole("button", { name: "Revoke" }))
  await userEvent.click(within(screen.getByRole("group")).getByRole("button", { name: "Revoke" }))

  await waitFor(() => expect(screen.queryByText("typo@harbor.test")).toBeNull())
})

it("cancelling the inline confirmation keeps the invitation", async () => {
  renderWithProviders(<TeamCard />)

  await screen.findByText("maya@harbor.test")
  await userEvent.click(screen.getByRole("button", { name: "Revoke" }))
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }))

  expect(screen.queryByText("Revoke the invitation for maya@harbor.test?")).toBeNull()
  expect(screen.getByText("maya@harbor.test")).toBeInTheDocument()
})

it("keeps Invite disabled until an email and a coordinator are given", async () => {
  renderWithProviders(<TeamCard />)

  const button = await screen.findByRole("button", { name: "Invite" })
  expect(button).toBeDisabled()
  await userEvent.type(screen.getByLabelText("Email"), "jess@harbor.test")
  expect(button).toBeDisabled()
  await userEvent.type(screen.getByLabelText("Coordinator"), "Jess Kim")
  await waitFor(() => expect(button).toBeEnabled())
})

it("shows the server's specific message for a duplicate invitation instead of the generic one", async () => {
  mockApi({
    "POST /api/v1/invitations": () =>
      Response.json(
        { error: { code: "already_invited", message: "That person already has a pending invitation." } },
        { status: 422 },
      ),
  })
  renderWithProviders(<TeamCard />)

  await invite("jess@harbor.test", "Jess Kim")

  expect(await screen.findByRole("alert")).toHaveTextContent("That person already has a pending invitation.")
})

it("falls back to a generic message when the failure carries no usable one", async () => {
  mockApi({ "POST /api/v1/invitations": () => Response.json({}, { status: 500 }) })
  renderWithProviders(<TeamCard />)

  await invite("jess@harbor.test", "Jess Kim")

  expect(await screen.findByRole("alert")).toHaveTextContent("We could not send the invitation. Try again.")
})

it("tells the user when the coordinator names could not be loaded", async () => {
  mockApi({ "GET /api/v1/coordinator_names": () => Response.json({ error: { code: "server_error", message: "x" } }, { status: 500 }) })
  renderWithProviders(<TeamCard />)

  expect(await screen.findByText(/could not load your coordinator names/i)).toBeInTheDocument()
  // Wired to the field, so a screen reader hears it with the input.
  expect(describedText(screen.getByLabelText("Coordinator"))).toMatch(/could not load your coordinator names/i)
})

it("shows an error with retry when the team cannot be loaded", async () => {
  mockApi({ "GET /api/v1/team": () => Response.json({ error: { code: "server_error", message: "x" } }, { status: 500 }) })
  renderWithProviders(<TeamCard />)

  expect(await screen.findByRole("alert")).toHaveTextContent("We could not load your team.")
})

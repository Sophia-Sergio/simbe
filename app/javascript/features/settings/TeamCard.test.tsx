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

it("shows an error with retry when the team cannot be loaded", async () => {
  mockApi({ "GET /api/v1/team": () => Response.json({ error: { code: "server_error", message: "x" } }, { status: 500 }) })
  renderWithProviders(<TeamCard />)

  expect(await screen.findByRole("alert")).toHaveTextContent("We could not load your team.")
})

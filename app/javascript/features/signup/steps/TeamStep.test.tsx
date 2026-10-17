import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HttpResponse } from "msw"
import { mockApi } from "@/test/mockApi"
import { renderWithProviders } from "@/test/renderWithProviders"
import { TeamStep } from "./TeamStep"

it("invites a coordinator by name and lists the owner and the invitation", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
  renderWithProviders(<TeamStep owner={null} />)

  await userEvent.type(screen.getByLabelText("Email"), "sam@harbor.test")
  await userEvent.selectOptions(screen.getByLabelText("Coordinator"), "Jess Kim")
  await userEvent.click(screen.getByRole("button", { name: "Invite" }))

  expect(await screen.findByText("Invitation sent")).toBeInTheDocument()
  expect(screen.getByText("Owner")).toBeInTheDocument()
  expect(screen.getAllByText("Invited").length).toBeGreaterThanOrEqual(1)
  expect(screen.getByText("sam@harbor.test")).toBeInTheDocument()

  await userEvent.click(screen.getByRole("button", { name: "Copy invite link" }))
  expect(writeText).toHaveBeenCalledWith(expect.stringContaining("/invite/"))
  expect(await screen.findByText("Invite link copied")).toBeInTheDocument()
})

it("rejects an email already on the team and resets the picker after a successful invite", async () => {
  renderWithProviders(<TeamStep owner={null} />)

  // The pending invitation in the team fixture is a duplicate; so is the owner.
  for (const duplicate of ["maya@harbor.test", "erin@harbor.test"]) {
    await userEvent.clear(screen.getByLabelText("Email"))
    await userEvent.type(screen.getByLabelText("Email"), duplicate)
    await userEvent.selectOptions(screen.getByLabelText("Coordinator"), "Jess Kim")
    await userEvent.click(screen.getByRole("button", { name: "Invite" }))
    expect(await screen.findByText("That email is already on your team")).toBeInTheDocument()
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true")
    expect(screen.queryByText("Invitation sent")).not.toBeInTheDocument()
  }

  await userEvent.clear(screen.getByLabelText("Email"))
  await userEvent.type(screen.getByLabelText("Email"), "sam@harbor.test")
  await userEvent.click(screen.getByRole("button", { name: "Invite" }))

  expect(await screen.findByText("Invitation sent")).toBeInTheDocument()
  expect(screen.getByLabelText("Email")).toHaveValue("")
  expect(screen.getByLabelText("Coordinator")).toHaveValue("")
})

it("shows the valid coordinator names after an unknown_coordinator error", async () => {
  mockApi({
    "POST /api/v1/invitations": () =>
      HttpResponse.json(
        { error: { code: "unknown_coordinator", message: "Pick an existing coordinator" }, valid_names: ["Dana Ortiz", "Jess Kim"] },
        { status: 422 },
      ),
  })
  renderWithProviders(<TeamStep owner={null} />)

  await userEvent.type(screen.getByLabelText("Email"), "x@harbor.test")
  await userEvent.selectOptions(screen.getByLabelText("Coordinator"), "Dana Ortiz")
  await userEvent.click(screen.getByRole("button", { name: "Invite" }))

  expect(await screen.findByText("Pick one of: Dana Ortiz, Jess Kim")).toBeInTheDocument()
})

it("offers Open my dashboard as a link to the app root", () => {
  renderWithProviders(<TeamStep owner={null} />)

  expect(screen.getByRole("link", { name: "Open my dashboard" })).toHaveAttribute("href", "/")
})

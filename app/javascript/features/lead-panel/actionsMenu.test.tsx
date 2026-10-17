import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderWithProviders } from "@/test/renderWithProviders"
import { LeadPanel } from "./LeadPanel"

const L4 = "aaaaaaaa-0000-4000-8000-000000000004"
const route = `/?lead=${L4}`

async function openActionsMenu() {
  const view = renderWithProviders(<LeadPanel />, { role: "coordinator", route })
  await screen.findByRole("heading", { name: "L4 Alpha" })
  const trigger = screen.getByRole("button", { name: /Actions/ })
  await userEvent.click(trigger)
  return { view, trigger, menu: await screen.findByRole("menu") }
}

it("focuses the first item when the Actions menu opens", async () => {
  const { menu } = await openActionsMenu()

  expect(within(menu).getByRole("menuitem", { name: "Send text" })).toHaveFocus()
})

it("Escape closes only the menu; a second Escape then closes the panel", async () => {
  const { view, trigger } = await openActionsMenu()

  await userEvent.keyboard("{Escape}")
  await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
  expect(view.location().search).toContain("lead=")
  expect(trigger).toHaveFocus()

  await userEvent.keyboard("{Escape}")
  await waitFor(() => expect(view.location().search).not.toContain("lead="))
})

it("arrow keys walk the menu items and wrap around", async () => {
  const { menu } = await openActionsMenu()
  const items = within(menu)

  await userEvent.keyboard("{ArrowDown}")
  expect(items.getByRole("menuitem", { name: "Call" })).toHaveFocus()
  await userEvent.keyboard("{ArrowDown}")
  expect(items.getByRole("menuitem", { name: "Send text" })).toHaveFocus()
  await userEvent.keyboard("{ArrowUp}")
  expect(items.getByRole("menuitem", { name: "Call" })).toHaveFocus()
  await userEvent.keyboard("{Home}")
  expect(items.getByRole("menuitem", { name: "Send text" })).toHaveFocus()
  await userEvent.keyboard("{End}")
  expect(items.getByRole("menuitem", { name: "Call" })).toHaveFocus()
})

it("choosing an item closes the menu and returns focus to the trigger", async () => {
  const { trigger, menu } = await openActionsMenu()

  await userEvent.click(within(menu).getByRole("menuitem", { name: "Send text" }))
  await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
  expect(trigger).toHaveFocus()
})

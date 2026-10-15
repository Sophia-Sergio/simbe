import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { setScenario } from "@/mocks/scenarios"
import { renderMobile } from "./renderMobile"

it("shows the mark and the screen title, truncating long titles", () => {
  renderMobile({ title: "A very long screen title that cannot possibly fit on a phone bar" })
  const title = screen.getByRole("heading", { level: 1 })
  expect(title).toHaveClass("truncate")
  expect(title).toHaveAttribute("title", "A very long screen title that cannot possibly fit on a phone bar")
  expect(screen.getAllByAltText("Simbe")[0]).toHaveAttribute("width", "26")
})

it("search icon opens the palette", async () => {
  const { palette } = renderMobile()
  await userEvent.click(screen.getByRole("button", { name: "Search candidates" }))
  expect(palette()).toHaveTextContent("open")
})

it("a pending load draws a progress line at the bar's bottom edge and says Loading data…", async () => {
  setScenario("loading")
  renderMobile()
  const line = await screen.findByRole("progressbar")
  expect(line).toHaveAttribute("aria-valuenow", "46")
  expect(screen.getByText("Loading data…")).toBeInTheDocument()
})

it("shows no progress line when nothing is pending", async () => {
  renderMobile()
  await screen.findByRole("button", { name: "Account" })
  await new Promise((resolve) => setTimeout(resolve, 50))
  expect(screen.queryByRole("progressbar")).toBeNull()
})

it("the avatar opens the account sheet; Sign out calls onSignOut and closes it", async () => {
  const onSignOut = vi.fn()
  renderMobile({ onSignOut })
  await userEvent.click(screen.getByRole("button", { name: "Account" }))
  const sheet = screen.getByRole("dialog", { name: "Account" })
  expect(sheet).toHaveTextContent("erin@harbor.test")
  await userEvent.click(screen.getByRole("button", { name: "Sign out" }))
  expect(onSignOut).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole("dialog")).toBeNull()
})

it("Esc closes the account sheet", async () => {
  renderMobile()
  await userEvent.click(screen.getByRole("button", { name: "Account" }))
  await userEvent.keyboard("{Escape}")
  expect(screen.queryByRole("dialog")).toBeNull()
})

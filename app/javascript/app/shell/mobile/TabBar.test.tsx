import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { askCalls } from "./fixtures"
import { renderMobile } from "./renderMobile"

const tabs = () => within(screen.getByRole("navigation", { name: "Tabs" }))
const labels = () =>
  Array.from(screen.getByRole("navigation", { name: "Tabs" }).querySelectorAll("a, button")).map((element) => element.textContent)

beforeEach(() => {
  askCalls.count = 0
})

it("owner tabs: Home, Pipeline, Channels, Ask, More", () => {
  renderMobile({ role: "owner" })
  expect(labels()).toEqual(["Home", "10Pipeline", "Channels", "Ask", "More"])
})

it("coordinator tabs: Next actions, My leads, Ask (no More)", () => {
  renderMobile({ role: "coordinator", route: "/next-actions" })
  expect(labels()).toEqual(["4Next actions", "My leads", "Ask"])
})

it("handles any list of tabs and only adds More when there are More rows", () => {
  renderMobile({ role: "coordinator" })
  expect(tabs().queryByRole("button", { name: "More" })).toBeNull()
})

it("More sheet lists the five rows and closes on selection while navigating", async () => {
  const { location } = renderMobile({ role: "owner" })
  await userEvent.click(tabs().getByRole("button", { name: "More" }))
  const sheet = screen.getByRole("dialog", { name: "More" })
  expect(within(sheet).getAllByRole("link").map((link) => link.textContent)).toEqual(["Funnel", "Coordinators", "Data sources", "Connect Claude", "Settings"])
  await userEvent.click(within(sheet).getByRole("link", { name: "Funnel" }))
  expect(location().pathname).toBe("/funnel")
  expect(screen.queryByRole("dialog")).toBeNull()
})

it("More sheet closes on Esc", async () => {
  renderMobile({ role: "owner" })
  await userEvent.click(tabs().getByRole("button", { name: "More" }))
  await userEvent.keyboard("{Escape}")
  expect(screen.queryByRole("dialog")).toBeNull()
})

it("More sheet closes on a scrim tap", async () => {
  renderMobile({ role: "owner" })
  await userEvent.click(tabs().getByRole("button", { name: "More" }))
  await userEvent.click(screen.getByTestId("scrim"))
  expect(screen.queryByRole("dialog")).toBeNull()
})

it("More sheet closes when the route changes underneath it", async () => {
  const { navigate } = renderMobile({ role: "owner" })
  await userEvent.click(tabs().getByRole("button", { name: "More" }))
  navigate("/pipeline")
  expect(await screen.findByRole("navigation", { name: "Tabs" })).toBeInTheDocument()
  expect(screen.queryByRole("dialog")).toBeNull()
})

it("marks nested routes active, and More active for more-items", () => {
  const nested = renderMobile({ role: "owner", route: "/channels/Facebook" })
  expect(tabs().getByRole("link", { name: "Channels" })).toHaveAttribute("aria-current", "page")
  expect(tabs().getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current")
  nested.unmount()
  renderMobile({ role: "owner", route: "/funnel" })
  expect(tabs().getByRole("button", { name: "More" })).toHaveClass("text-brand")
  expect(tabs().getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current")
})

it("Home is active only on /", () => {
  renderMobile({ role: "owner", route: "/" })
  expect(tabs().getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page")
})

it("Ask is an action: calls its handler, does not navigate, never aria-current", async () => {
  const { location } = renderMobile({ role: "owner", route: "/pipeline" })
  await userEvent.click(tabs().getByRole("button", { name: "Ask" }))
  expect(askCalls.count).toBe(1)
  expect(location().pathname).toBe("/pipeline")
  expect(tabs().getByRole("button", { name: "Ask" })).not.toHaveAttribute("aria-current")
  expect(tabs().getByRole("button", { name: "Ask" })).not.toHaveClass("text-brand")
})

it("Ask looks active only while the agent is open", () => {
  renderMobile({ role: "owner", agentOpen: true })
  expect(tabs().getByRole("button", { name: "Ask" })).toHaveClass("text-brand")
})

it("shows a badge on tabs with useBadge", () => {
  renderMobile({ role: "coordinator", route: "/next-actions" })
  expect(within(tabs().getByRole("link", { name: /Next actions/ })).getByText("4")).toBeInTheDocument()
})

it("tab targets are 58px tall and respect the safe area", () => {
  renderMobile({ role: "owner" })
  expect(tabs().getByRole("link", { name: "Home" })).toHaveClass("h-[58px]")
  expect(screen.getByRole("navigation", { name: "Tabs" })).toHaveClass("pb-[env(safe-area-inset-bottom)]")
})

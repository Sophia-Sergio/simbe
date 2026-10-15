import { useState } from "react"
import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Home } from "lucide-react"
import { renderWithProviders } from "@/test/renderWithProviders"
import type { NavItem } from "../../feature"
import { askCalls } from "./fixtures"
import { MoreSheet } from "./MoreSheet"
import { TabBar } from "./TabBar"
import { renderMobile } from "./renderMobile"

const tabs = () => within(screen.getByRole("navigation", { name: "Tabs" }))
// What a screen reader announces: the text minus aria-hidden parts (the count badge).
const nameOf = (element: Element) => {
  const clone = element.cloneNode(true) as Element
  clone.querySelectorAll("[aria-hidden='true']").forEach((node) => node.remove())
  return clone.textContent
}
const labels = () => Array.from(screen.getByRole("navigation", { name: "Tabs" }).querySelectorAll("a, button")).map(nameOf)

beforeEach(() => {
  askCalls.count = 0
})

it("owner tabs: Home, Pipeline, Channels, Ask, More", () => {
  renderMobile({ role: "owner" })
  expect(labels()).toEqual(["Home", "Pipeline", "Channels", "Ask", "More"])
})

it("coordinator tabs: Next actions, My leads, Ask (no More)", () => {
  renderMobile({ role: "coordinator", route: "/next-actions" })
  expect(labels()).toEqual(["Next actions", "My leads", "Ask"])
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
  expect(tabs().getByRole("button", { name: "Ask" })).not.toHaveClass("text-brand")
})

it("Ask looks active only while the agent is open", () => {
  renderMobile({ role: "owner", agentOpen: true })
  expect(tabs().getByRole("button", { name: "Ask" })).toHaveClass("text-brand")
})

it("shows a badge on tabs with useBadge, kept out of the accessible name", () => {
  renderMobile({ role: "coordinator", route: "/next-actions" })
  const link = tabs().getByRole("link", { name: "Next actions" })
  expect(within(link).getByText("4")).toHaveAttribute("aria-hidden", "true")
})

it("caps large badge counts at 99+", () => {
  const big: NavItem = { id: "b", label: "Big", icon: Home, section: "today", roles: ["owner"], order: 1, to: "/b", useBadge: () => 1234, mobile: { tab: { order: 1 } } }
  renderWithProviders(<TabBar tabs={[big]} hasMore={false} onMore={() => {}} moreActive={false} />, { viewport: 390 })
  expect(screen.getByText("99+")).toBeInTheDocument()
  expect(screen.queryByText("1234")).toBeNull()
})

it("renders nothing when there are no tabs and no More rows", () => {
  renderWithProviders(<TabBar tabs={[]} hasMore={false} onMore={() => {}} moreActive={false} />, { viewport: 390 })
  expect(screen.queryByRole("navigation", { name: "Tabs" })).toBeNull()
})

it("survives a tab whose badge hook appears and disappears between renders", async () => {
  function Harness() {
    const [withBadge, setWithBadge] = useState(true)
    const item: NavItem = { id: "p", label: "Pipeline", icon: Home, section: "today", roles: ["owner"], order: 1, to: "/pipeline", useBadge: withBadge ? () => 3 : undefined, mobile: { tab: { order: 1 } } }
    return (
      <>
        <button type="button" onClick={() => setWithBadge(false)}>
          drop badge
        </button>
        <TabBar tabs={[item]} hasMore={false} onMore={() => {}} moreActive={false} />
      </>
    )
  }
  renderWithProviders(<Harness />, { viewport: 390 })
  expect(screen.getByText("3")).toBeInTheDocument()
  await userEvent.click(screen.getByRole("button", { name: "drop badge" }))
  expect(screen.queryByText("3")).toBeNull()
  expect(screen.getByRole("link", { name: "Pipeline" })).toBeInTheDocument()
})

it("skips More rows that have no page to open", async () => {
  const action: NavItem = { id: "x", label: "Do thing", icon: Home, section: "agency", roles: ["owner"], order: 1, useOnSelect: () => () => {}, mobile: { more: { order: 1 } } }
  renderWithProviders(<MoreSheet items={[action]} open onClose={() => {}} />, { viewport: 390 })
  expect(screen.queryByRole("link", { name: "Do thing" })).toBeNull()
})

it("tab targets are 58px tall and respect the safe area", () => {
  renderMobile({ role: "owner" })
  expect(tabs().getByRole("link", { name: "Home" })).toHaveClass("h-[58px]")
  expect(screen.getByRole("navigation", { name: "Tabs" })).toHaveClass("pb-[env(safe-area-inset-bottom)]")
})

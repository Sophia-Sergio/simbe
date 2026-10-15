import { useState } from "react"
import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Home, Sparkles } from "lucide-react"
import type { NavItem } from "../../feature"
import { Sidebar } from "./Sidebar"
import { AGENCY, OWNER, renderShell } from "./renderShell"
import { renderWithProviders } from "@/test/renderWithProviders"

it("renders sections and items for owners and skips mobile-only items", () => {
  renderShell({ role: "owner", route: "/funnel" })
  ;["Insights", "Operations", "Agency", "This week", "Funnel", "Channels", "Pipeline", "Coordinators", "Data sources", "Connect Claude", "Settings"].forEach((text) =>
    expect(screen.getByText(text)).toBeInTheDocument(),
  )
  expect(screen.queryByText("Today")).toBeNull()
  expect(screen.queryByText("Ask")).toBeNull()
  expect(screen.getByRole("link", { name: /Funnel/ })).toHaveAttribute("aria-current", "page")
  expect(screen.getByRole("link", { name: /This week/ })).not.toHaveAttribute("aria-current")
})

it("lists sections in Today, Insights, Operations, Agency order", () => {
  renderShell({ role: "owner" })
  const headings = screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)
  expect(headings).toEqual(["Insights", "Operations", "Agency"])
})

it("shows only Today for coordinators, with the badge", () => {
  renderShell({ role: "coordinator", route: "/next-actions" })
  expect(screen.getByText("Today")).toBeInTheDocument()
  expect(screen.queryByText("Insights")).toBeNull()
  expect(screen.queryByText("Agency")).toBeNull()
  expect(within(screen.getByRole("link", { name: /Next actions/ })).getByText("4")).toBeInTheDocument()
})

it("shows a count pill only when the count is above zero", () => {
  renderShell({ role: "owner" })
  expect(within(screen.getByRole("link", { name: /Pipeline/ })).getByText("10")).toBeInTheDocument()
  expect(within(screen.getByRole("link", { name: /Funnel/ })).queryByText(/\d/)).toBeNull()
})

it("keeps Channels active on a nested route and does not match / for everything", () => {
  renderShell({ role: "owner", route: "/channels/Facebook" })
  expect(screen.getByRole("link", { name: /Channels/ })).toHaveAttribute("aria-current", "page")
  expect(screen.getByRole("link", { name: /This week/ })).not.toHaveAttribute("aria-current")
})

it("does not treat a sibling with the same prefix as nested", () => {
  renderShell({ role: "owner", route: "/channelsX" })
  expect(screen.getByRole("link", { name: /Channels/ })).not.toHaveAttribute("aria-current")
})

it("marks / active only on /", () => {
  renderShell({ role: "owner", route: "/" })
  expect(screen.getByRole("link", { name: /This week/ })).toHaveAttribute("aria-current", "page")
})

it("collapses to 64px and keeps tooltips and the active state", async () => {
  renderShell({ role: "owner", route: "/funnel" })
  const sidebar = screen.getByTestId("sidebar")
  expect(sidebar).toHaveClass("w-56")
  await userEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }))
  expect(sidebar).toHaveClass("w-16")
  const funnel = screen.getByRole("link", { name: /Funnel/ })
  expect(funnel).toHaveAttribute("title", "Funnel")
  expect(funnel).toHaveAttribute("aria-current", "page")
  expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeInTheDocument()
})

it("truncates long agency and user names and keeps the full text in a title", () => {
  const longAgency = { ...AGENCY, name: "The Extraordinarily Long Harbor Surrogacy And Family Agency" }
  renderWithProviders(
    <Sidebar
      nav={[{ id: "h", label: "Home", icon: Home, section: "insights", roles: ["owner"], order: 1, to: "/" }]}
      agency={longAgency}
      user={{ ...OWNER, name: "Erin Marguerite Harbor-Whitfield The Third" }}
      collapsed={false}
      onToggle={() => {}}
      onSignOut={() => {}}
    />,
  )
  const agencyName = screen.getByText(longAgency.name)
  expect(agencyName).toHaveClass("truncate")
  expect(agencyName).toHaveAttribute("title", longAgency.name)
  const userName = screen.getByText("Erin Marguerite Harbor-Whitfield The Third")
  expect(userName).toHaveClass("truncate")
  expect(screen.getByTestId("sidebar")).toHaveClass("w-56")
})

it("shows the agency time zone label", () => {
  renderShell()
  expect(screen.getByText("Pacific time")).toBeInTheDocument()
})

it("action items call their handler", async () => {
  const handler = vi.fn()
  renderWithProviders(
    <Sidebar
      nav={[{ id: "ask", label: "Ask", icon: Sparkles, section: "insights", roles: ["owner"], order: 1, useOnSelect: () => handler }]}
      agency={AGENCY}
      user={OWNER}
      collapsed={false}
      onToggle={() => {}}
      onSignOut={() => {}}
    />,
  )
  await userEvent.click(screen.getByRole("button", { name: "Ask" }))
  expect(handler).toHaveBeenCalledTimes(1)
})

it("sign out button calls onSignOut", async () => {
  const onSignOut = vi.fn()
  renderShell({ onSignOut })
  await userEvent.click(within(screen.getByTestId("sidebar")).getByRole("button", { name: "Sign out" }))
  expect(onSignOut).toHaveBeenCalledTimes(1)
})

it("shows the owner's name and capitalized role in the footer", () => {
  renderShell()
  const sidebar = within(screen.getByTestId("sidebar"))
  expect(sidebar.getByText("Erin Harbor")).toBeInTheDocument()
  expect(sidebar.getByText("Owner")).toBeInTheDocument()
})

it("matches paths case-insensitively like the router", () => {
  renderShell({ role: "owner", route: "/Channels/Facebook" })
  expect(screen.getByRole("link", { name: /Channels/ })).toHaveAttribute("aria-current", "page")
})

it("survives a nav item whose badge hook appears and disappears between renders", async () => {
  function Harness() {
    const [withBadge, setWithBadge] = useState(true)
    const item: NavItem = {
      id: "p",
      label: "Pipeline",
      icon: Home,
      section: "insights",
      roles: ["owner"],
      order: 1,
      to: "/pipeline",
      useBadge: withBadge ? () => 3 : undefined,
    }
    return (
      <>
        <button type="button" onClick={() => setWithBadge(false)}>
          drop badge
        </button>
        <Sidebar nav={[item]} agency={AGENCY} user={OWNER} collapsed={false} onToggle={() => {}} onSignOut={() => {}} />
      </>
    )
  }
  renderWithProviders(<Harness />)
  expect(screen.getByText("3")).toBeInTheDocument()
  await userEvent.click(screen.getByRole("button", { name: "drop badge" }))
  expect(screen.queryByText("3")).toBeNull()
  expect(screen.getByRole("link", { name: /Pipeline/ })).toBeInTheDocument()
})

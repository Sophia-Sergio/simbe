import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { AgentContext } from "@/app/agent"
import { renderWithProviders } from "@/test/renderWithProviders"
import { ChannelPage } from "./ChannelPage"

const mount = (ui = <ChannelPage />, channel = "Facebook") =>
  renderWithProviders(ui, { route: `/channels/${channel}?range=90d`, path: "/channels/:channel" })

it("shows the KPIs, the campaign and a back link that keeps the range", async () => {
  mount()
  expect(await screen.findByText("c-a")).toBeInTheDocument()
  expect(screen.getByRole("heading", { level: 1, name: "Facebook" })).toBeInTheDocument()
  expect(screen.getAllByText("66.7%").length).toBeGreaterThan(0)
  expect(screen.getByRole("link", { name: "Channels" })).toHaveAttribute("href", "/channels?range=90d")
})

it("Ask Simbe sends a question naming the channel to the agent", async () => {
  const open = vi.fn()
  mount(
    <AgentContext.Provider value={{ isOpen: false, open, close: () => {} }}>
      <ChannelPage />
    </AgentContext.Provider>,
  )
  await userEvent.click(await screen.findByRole("button", { name: /ask simbe/i }))
  expect(open).toHaveBeenCalledWith("How is Facebook performing and what should I change?")
})

it("renders a not-found state for an unknown channel", async () => {
  mount(<ChannelPage />, "Nope")
  expect(await screen.findByText("We couldn't find that channel")).toBeInTheDocument()
  expect(screen.getByRole("link", { name: "Back to channels" })).toHaveAttribute("href", "/channels")
})

it("shows an empty campaigns message for a channel without campaigns", async () => {
  mount(<ChannelPage />, "TikTok")
  expect(await screen.findByText("No campaigns for this channel yet")).toBeInTheDocument()
})

it("stacks campaigns as cards on a phone", async () => {
  renderWithProviders(<ChannelPage />, { route: "/channels/Facebook", path: "/channels/:channel", viewport: 390 })
  expect(await screen.findByText(/3 leads · 2 qualified/)).toBeInTheDocument()
})

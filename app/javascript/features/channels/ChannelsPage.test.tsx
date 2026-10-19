import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import channelsFixture from "@contracts/examples/metrics/channels.json"
import { mockApi } from "@/test/mockApi"
import { setScenario } from "@/mocks/scenarios"
import { renderWithProviders } from "@/test/renderWithProviders"
import { ChannelsPage } from "./ChannelsPage"

it("lists channels with the best-rate pill and navigates to the detail on a row click", async () => {
  const { location } = renderWithProviders(<ChannelsPage />, { route: "/channels?range=90d" })
  const best = await screen.findByRole("row", { name: /Referral/ })
  expect(within(best).getByText("Best")).toHaveClass("bg-success-bg")
  const row = screen.getByRole("row", { name: /Facebook/ })
  expect(within(row).getByText("66.7%")).toBeInTheDocument()
  await userEvent.click(within(row).getByText("Facebook")) // a click on the cell, not only on the row element
  expect(location().pathname).toBe("/channels/Facebook")
  expect(location().search).toBe("?range=90d")
})

it("marks the lowest channel danger and shows a dash without a standing", async () => {
  mockApi({
    "GET /api/v1/metrics/channels": {
      ...channelsFixture,
      rows: [
        { ...channelsFixture.rows[0], flag: "best" },
        { ...channelsFixture.rows[1], flag: "worst" },
        { ...channelsFixture.rows[3], flag: null },
      ],
    },
  })
  renderWithProviders(<ChannelsPage />)
  const worst = await screen.findByRole("row", { name: /Google/ })
  expect(within(worst).getByText("Lowest")).toHaveClass("bg-danger-bg")
  const referral = screen.getByRole("row", { name: /Referral/ })
  expect(within(referral).getAllByRole("cell")[4]).toHaveTextContent("—")
})

it("says how channels are ranked", async () => {
  renderWithProviders(<ChannelsPage />)
  expect(await screen.findByText("Ranked by number of leads; best and lowest compare qualified rate")).toBeInTheDocument()
})

it("has no spend or cost columns", async () => {
  renderWithProviders(<ChannelsPage />)
  await screen.findByRole("row", { name: /Facebook/ })
  expect(screen.queryByText("Spend")).not.toBeInTheDocument()
  expect(screen.queryByText("Per qualified")).not.toBeInTheDocument()
})

it("renders the two insight cards", async () => {
  renderWithProviders(<ChannelsPage />)
  expect(await screen.findByText("10% of leads have no source")).toBeInTheDocument()
  expect(screen.getByText(/outside your main states/)).toBeInTheDocument()
  expect(screen.getByText(/CA, ID/)).toBeInTheDocument()
})

it("stacks channel cards on a phone and opens one on tap", async () => {
  const { location } = renderWithProviders(<ChannelsPage />, { viewport: 390 })
  await userEvent.click(await screen.findByRole("button", { name: /Facebook/ }))
  expect(location().pathname).toBe("/channels/Facebook")
})

it("offers 'Load your data' to an owner with no channels", async () => {
  mockApi({ "GET /api/v1/metrics/channels": { rows: [], insights: channelsFixture.insights } })
  setScenario("empty")
  renderWithProviders(<ChannelsPage />)
  expect(await screen.findByRole("link", { name: /load your data/i })).toHaveAttribute("href", "/data")
})

it("shows 'Loading your data…' while an upload is pending", async () => {
  mockApi({ "GET /api/v1/metrics/channels": { rows: [], insights: channelsFixture.insights } })
  setScenario("loading")
  renderWithProviders(<ChannelsPage />)
  expect(await screen.findByText("Loading your data…")).toBeInTheDocument()
})

it("shows an error with retry", async () => {
  mockApi({ "GET /api/v1/metrics/channels": () => Response.json({ code: "boom", message: "x" }, { status: 500 }) })
  renderWithProviders(<ChannelsPage />)
  expect(await screen.findByRole("alert")).toHaveTextContent(/could not load/i)
})

it("uses the singular for one lead on a phone card", async () => {
  renderWithProviders(<ChannelsPage />, { viewport: 390 })
  const referral = await screen.findByRole("button", { name: /Referral/ })
  expect(referral).toHaveTextContent("1 lead ·")
  expect(referral).not.toHaveTextContent("1 leads")
})

it("does not round a share below 1% to 0%", async () => {
  mockApi({ "GET /api/v1/metrics/channels": { ...channelsFixture, insights: { ...channelsFixture.insights, out_of_area: { count: 2, pct: 0.4, main_states: ["CA"] } } } })
  renderWithProviders(<ChannelsPage />)
  expect(await screen.findByText("0.4% of leads are outside your main states")).toBeInTheDocument()
})

it("the channel name is a real link (keyboard and screen-reader friendly)", async () => {
  renderWithProviders(<ChannelsPage />, { route: "/channels?range=90d" })
  expect(await screen.findByRole("link", { name: "Facebook" })).toHaveAttribute("href", "/channels/Facebook?range=90d")
})

it("explains how the rate is calculated in a tooltip", async () => {
  renderWithProviders(<ChannelsPage />)
  await screen.findByRole("row", { name: /Facebook/ })
  await userEvent.hover(screen.getAllByRole("button", { name: "How the rate is calculated" })[0])
  const tip = screen.getByRole("tooltip")
  expect(tip).toHaveTextContent("Rate = qualified ÷ leads")
  expect(tip).toHaveTextContent("Facebook: 2 ÷ 3 = 66.7%")
})

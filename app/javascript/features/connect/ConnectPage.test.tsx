import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { setScenario } from "@/mocks/scenarios"
import { mockApi } from "@/test/mockApi"
import { renderWithProviders } from "@/test/renderWithProviders"
import { ConnectPage } from "./ConnectPage"

const KEY = /simbe_live_[A-Za-z0-9]{24}/

it("shows the server URL, a masked key and the five tools", async () => {
  renderWithProviders(<ConnectPage />)
  expect(await screen.findByDisplayValue("https://mcp.simbe.app/harbor")).toBeInTheDocument()
  const key = screen.getByLabelText("API key") as HTMLInputElement
  expect(key.value).toMatch(/^simbe_live_ab12•+/)
  ;["get_funnel", "get_channel_performance", "get_dropoff_reasons", "get_next_actions", "forecast_spend"].forEach((tool) =>
    expect(screen.getByText(tool)).toBeInTheDocument(),
  )
})

it("says there is no key yet for a new agency", async () => {
  setScenario("new")
  renderWithProviders(<ConnectPage />)
  expect((await screen.findByLabelText("API key")) as HTMLInputElement).toHaveValue("No key yet — generate one")
})

it("config JSON uses a placeholder until a key is generated", async () => {
  renderWithProviders(<ConnectPage />)
  const config = await screen.findByLabelText("Claude configuration", { selector: "pre" })
  expect(config).toHaveTextContent("Bearer YOUR_KEY")
  expect(config).toHaveTextContent('"url": "https://mcp.simbe.app/harbor"')
})

it("generating asks for confirmation inline, then shows the full key once, in the config too", async () => {
  renderWithProviders(<ConnectPage />)
  await userEvent.click(await screen.findByRole("button", { name: "Generate new key" }))
  expect(screen.getByText("This revokes the current key immediately.")).toBeInTheDocument()
  expect(screen.queryByRole("dialog")).toBeNull() // inline, never a stacked overlay
  await userEvent.click(within(screen.getByRole("group")).getByRole("button", { name: "Generate new key" }))
  await waitFor(() => expect((screen.getByLabelText("API key") as HTMLInputElement).value).toMatch(KEY))
  const full = (screen.getByLabelText("API key") as HTMLInputElement).value
  expect(screen.getByText(/shown only once/i)).toBeInTheDocument()
  expect(screen.getByLabelText("Claude configuration", { selector: "pre" })).toHaveTextContent(`Bearer ${full}`)
})

it("cancelling the confirmation keeps the current key", async () => {
  renderWithProviders(<ConnectPage />)
  await userEvent.click(await screen.findByRole("button", { name: "Generate new key" }))
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }))
  expect(screen.queryByText("This revokes the current key immediately.")).toBeNull()
  expect((screen.getByLabelText("API key") as HTMLInputElement).value).toMatch(/^simbe_live_ab12/)
})

it("after leaving the page the key is masked again (nothing is stored client-side)", async () => {
  const first = renderWithProviders(<ConnectPage />)
  await userEvent.click(await screen.findByRole("button", { name: "Generate new key" }))
  await userEvent.click(within(screen.getByRole("group")).getByRole("button", { name: "Generate new key" }))
  await waitFor(() => expect((screen.getByLabelText("API key") as HTMLInputElement).value).toMatch(KEY))
  const full = (screen.getByLabelText("API key") as HTMLInputElement).value
  first.unmount()
  renderWithProviders(<ConnectPage />)
  const masked = ((await screen.findByLabelText("API key")) as HTMLInputElement).value
  expect(masked).not.toBe(full)
  expect(masked).toMatch(/•/)
  expect(JSON.stringify({ ...localStorage })).not.toContain(full)
})

it("a conflicting rotation shows the in-progress message", async () => {
  mockApi({ "POST /api/v1/mcp/rotate": () => Response.json({ code: "already_in_progress", message: "x" }, { status: 409 }) })
  renderWithProviders(<ConnectPage />)
  await userEvent.click(await screen.findByRole("button", { name: "Generate new key" }))
  await userEvent.click(within(screen.getByRole("group")).getByRole("button", { name: "Generate new key" }))
  expect(await screen.findByRole("alert")).toHaveTextContent("A key is already being generated.")
})

it("a double click on the confirm button generates once", async () => {
  let calls = 0
  mockApi({
    "POST /api/v1/mcp/rotate": async () => {
      calls += 1
      await new Promise((resolve) => setTimeout(resolve, 40))
      return Response.json({ key: "simbe_live_" + "a".repeat(24), url: "https://mcp.simbe.app/harbor", key_prefix: "simbe_live_aaaaaaa" }, { status: 201 })
    },
  })
  renderWithProviders(<ConnectPage />)
  await userEvent.click(await screen.findByRole("button", { name: "Generate new key" }))
  await userEvent.dblClick(within(screen.getByRole("group")).getByRole("button", { name: "Generate new key" }))
  await waitFor(() => expect((screen.getByLabelText("API key") as HTMLInputElement).value).toMatch(KEY))
  expect(calls).toBe(1)
})

it("Copy writes the value to the clipboard and toasts", async () => {
  const user = userEvent.setup()
  renderWithProviders(<ConnectPage />)
  await user.click(await screen.findByRole("button", { name: "Copy Server URL" }))
  expect(await screen.findByText("Copied")).toBeInTheDocument()
  expect(await navigator.clipboard.readText()).toBe("https://mcp.simbe.app/harbor")
})

it("shows an error with retry when settings fail", async () => {
  mockApi({ "GET /api/v1/mcp": () => Response.json({ code: "boom", message: "x" }, { status: 500 }) })
  renderWithProviders(<ConnectPage />)
  expect(await screen.findByRole("alert")).toHaveTextContent(/could not load/i)
})

it("moves focus into the confirmation, back to the trigger on cancel and to the key field after generating", async () => {
  renderWithProviders(<ConnectPage />)
  await userEvent.click(await screen.findByRole("button", { name: "Generate new key" }))
  const confirm = within(screen.getByRole("group")).getByRole("button", { name: "Generate new key" })
  await waitFor(() => expect(confirm).toHaveFocus())
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }))
  await waitFor(() => expect(screen.getByRole("button", { name: "Generate new key" })).toHaveFocus())
  await userEvent.click(screen.getByRole("button", { name: "Generate new key" }))
  await userEvent.click(within(screen.getByRole("group")).getByRole("button", { name: "Generate new key" }))
  await waitFor(() => expect(screen.getByLabelText("API key")).toHaveFocus())
})

it("announces the shown-once notice through a live region that exists before the key does", async () => {
  renderWithProviders(<ConnectPage />)
  await screen.findByLabelText("API key")
  const region = within(screen.getByRole("region", { name: "Connection" })).getByRole("status")
  expect(region).toBeEmptyDOMElement()
  await userEvent.click(screen.getByRole("button", { name: "Generate new key" }))
  await userEvent.click(within(screen.getByRole("group")).getByRole("button", { name: "Generate new key" }))
  await waitFor(() => expect(region).toHaveTextContent(/shown only once/i))
})

it("Copy API key is disabled while only the masked key or no key is shown, and enabled with the full key", async () => {
  renderWithProviders(<ConnectPage />)
  expect(await screen.findByRole("button", { name: "Copy API key" })).toBeDisabled()
  await userEvent.click(screen.getByRole("button", { name: "Generate new key" }))
  await userEvent.click(within(screen.getByRole("group")).getByRole("button", { name: "Generate new key" }))
  await waitFor(() => expect(screen.getByRole("button", { name: "Copy API key" })).toBeEnabled())
})

it("the configuration Copy button is at least 36px tall (mobile tap target)", async () => {
  renderWithProviders(<ConnectPage />)
  expect(await screen.findByRole("button", { name: "Copy configuration" })).toHaveClass("h-9")
})

it("a failed clipboard write shows the manual-copy toast", async () => {
  const user = userEvent.setup()
  renderWithProviders(<ConnectPage />)
  const button = await screen.findByRole("button", { name: "Copy Server URL" })
  vi.spyOn(navigator.clipboard, "writeText").mockRejectedValueOnce(new Error("denied"))
  await user.click(button)
  expect(await screen.findByText(/could not copy/i)).toBeInTheDocument()
})

it("the in-progress alert clears when a retry succeeds", async () => {
  let first = true
  mockApi({
    "POST /api/v1/mcp/rotate": () => {
      if (first) {
        first = false
        return Response.json({ code: "already_in_progress", message: "x" }, { status: 409 })
      }
      return Response.json({ key: "simbe_live_" + "b".repeat(24), url: "https://mcp.simbe.app/harbor", key_prefix: "simbe_live_bbbbbbb" }, { status: 201 })
    },
  })
  renderWithProviders(<ConnectPage />)
  await userEvent.click(await screen.findByRole("button", { name: "Generate new key" }))
  await userEvent.click(within(screen.getByRole("group")).getByRole("button", { name: "Generate new key" }))
  expect(await screen.findByRole("alert")).toBeInTheDocument()
  await userEvent.click(screen.getByRole("button", { name: "Generate new key" }))
  await userEvent.click(within(screen.getByRole("group")).getByRole("button", { name: "Generate new key" }))
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull())
})

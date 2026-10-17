import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import answerFixture from "@contracts/examples/agent/answer.json"
import { useAgent } from "@/app/agent"
import { mockApi } from "@/test/mockApi"
import { renderWithProviders } from "@/test/renderWithProviders"
import { AgentFab } from "./AgentFab"
import { AgentPanel } from "./AgentPanel"
import { AgentProvider } from "./AgentProvider"

const ANSWER = answerFixture.message.body
const OWNER_CHIPS = [
  "Which channel costs the most per qualified lead?",
  "Where do most applicants drop off?",
  "How should I split next month's budget?",
  "Who needs support on my team?",
]
const COORDINATOR_CHIPS = ["Who should I text back first?", "Which leads are overdue?", "Where am I losing applicants?"]

/** The panel + FAB behind the real provider, with a button to trigger `open()` like another lane does. */
function Harness({ question }: { question?: string }) {
  const agent = useAgent()
  return (
    <>
      <button type="button" onClick={() => agent.open(question)}>
        Open agent
      </button>
      <AgentFab />
      <AgentPanel />
    </>
  )
}

function mount(options: { question?: string; role?: "owner" | "coordinator"; route?: string; viewport?: number } = {}) {
  const { question, role = "owner", route = "/", viewport = 1280 } = options
  return renderWithProviders(
    <AgentProvider>
      <Harness question={question} />
    </AgentProvider>,
    { role, route, viewport },
  )
}

const openFab = () => userEvent.click(screen.getByRole("button", { name: "Ask Simbe" }))
const ask = async (text: string) => {
  await userEvent.click(await screen.findByLabelText("Ask about your business"))
  await userEvent.type(screen.getByLabelText("Ask about your business"), text)
  await userEvent.click(screen.getByRole("button", { name: "Send" }))
}

it("opens from the FAB with the empty state, four owner chips and a chart answer", async () => {
  mount()
  await openFab()
  expect(await screen.findByText("How can I help this week?")).toBeInTheDocument()
  expect(await screen.findByText("Harbor Surrogacy data only")).toBeInTheDocument()
  for (const chip of OWNER_CHIPS) expect(await screen.findByRole("button", { name: chip })).toBeInTheDocument()

  await userEvent.click(screen.getByRole("button", { name: OWNER_CHIPS[0] }))
  expect(await screen.findByText(ANSWER.text)).toBeInTheDocument()
  expect(screen.getByRole("img", { name: /Cost per qualified lead/ })).toBeInTheDocument()
})

it("exposes the conversation as a polite live log and the pending line as a status", async () => {
  let release!: (response: Response) => void
  mockApi({ "POST /api/v1/agent/messages": () => new Promise<Response>((resolve) => (release = resolve)) })
  mount()
  await openFab()

  const log = await screen.findByRole("log")
  expect(log).toHaveAttribute("aria-live", "polite")

  await userEvent.click(screen.getByRole("button", { name: OWNER_CHIPS[0] }))
  expect(within(log).getByRole("status")).toHaveTextContent("Reading your data…")

  release(Response.json(answerFixture, { status: 201 }))
  expect(await screen.findByText(ANSWER.text)).toBeInTheDocument()
})

describe("scrolling to the newest turn", () => {
  afterEach(() => {
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
  })

  it("scrolls to the pending question, then to the start of the new answer", async () => {
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    let release!: (response: Response) => void
    mockApi({ "POST /api/v1/agent/messages": () => new Promise<Response>((resolve) => (release = resolve)) })
    mount()
    await openFab()
    await userEvent.click(await screen.findByRole("button", { name: OWNER_CHIPS[0] }))
    await screen.findByText("Reading your data…")
    expect(scroll).toHaveBeenLastCalledWith({ block: "end" })

    release(Response.json(answerFixture, { status: 201 }))
    await screen.findByText(ANSWER.text)
    await waitFor(() => expect(scroll).toHaveBeenLastCalledWith({ block: "start" }))
  })
})

it("shows the pulsing pending line and disables the composer while the answer is in flight", async () => {
  let release!: (response: Response) => void
  mockApi({ "POST /api/v1/agent/messages": () => new Promise<Response>((resolve) => (release = resolve)) })
  mount()
  await openFab()
  await userEvent.click(await screen.findByRole("button", { name: OWNER_CHIPS[0] }))

  expect(await screen.findByText("Reading your data…")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Send" })).toBeDisabled()
  expect(screen.getByLabelText("Ask about your business")).toBeDisabled()

  release(new Response(JSON.stringify(answerFixture), { status: 201, headers: { "Content-Type": "application/json" } }))
  expect(await screen.findByText(ANSWER.text)).toBeInTheDocument()
  expect(screen.getByLabelText("Ask about your business")).toBeEnabled()
})

it("renders the action and source chips; the action navigates and closes the panel", async () => {
  const { location } = mount()
  await openFab()
  await userEvent.click(await screen.findByRole("button", { name: OWNER_CHIPS[0] }))
  await screen.findByText(ANSWER.text)

  expect(screen.getByText("Sources")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Channels" })).toBeInTheDocument()
  await userEvent.click(screen.getByRole("button", { name: "Open channels" }))

  expect(location().pathname).toBe("/channels")
  expect(screen.queryByRole("dialog")).toBeNull()
})

it("drops an off-app action and off-app source chips but keeps the in-app ones", async () => {
  mockApi({
    "POST /api/v1/agent/messages": () =>
      Response.json(
        {
          conversation_id: "c1",
          message: {
            id: "m1",
            role: "assistant",
            body: {
              text: "Here you go.",
              action: { label: "Open evil", route: "//evil.example" },
              sources: [
                { label: "Evil", route: "https://evil.example" },
                { label: "Channels", route: "/channels" },
              ],
            },
          },
        },
        { status: 201 },
      ),
  })
  const { location } = mount()
  await openFab()
  await ask("hi")

  expect(await screen.findByText("Here you go.")).toBeInTheDocument()
  expect(screen.queryByRole("button", { name: /open evil/i })).toBeNull()
  expect(screen.queryByText("Evil")).toBeNull()
  await userEvent.click(screen.getByRole("button", { name: "Channels" }))
  expect(location().pathname).toBe("/channels")
})

it("allows an in-app action with a query string", async () => {
  mockApi({
    "POST /api/v1/agent/messages": () =>
      Response.json(
        { conversation_id: "c1", message: { id: "m1", role: "assistant", body: { text: "ok", action: { label: "Open pipeline", route: "/pipeline?lead=1" } } } },
        { status: 201 },
      ),
  })
  const { location } = mount()
  await openFab()
  await ask("hi")

  await userEvent.click(await screen.findByRole("button", { name: "Open pipeline" }))
  expect(location().pathname).toBe("/pipeline")
  expect(location().search).toBe("?lead=1")
})

it("a source chip navigates and a follow-up chip sends the next question", async () => {
  const seen: string[] = []
  mockApi({
    "POST /api/v1/agent/messages": async (request: Request) => {
      seen.push((await request.json()).text)
      return Response.json(answerFixture, { status: 201 })
    },
  })
  const { location } = mount()
  await openFab()
  await userEvent.click(await screen.findByRole("button", { name: OWNER_CHIPS[0] }))
  await screen.findByText(ANSWER.text)

  await userEvent.click(screen.getByRole("button", { name: "What about Google?" }))
  await waitFor(() => expect(seen).toEqual([OWNER_CHIPS[0], "What about Google?"]))

  await userEvent.click(screen.getAllByRole("button", { name: "Channels" })[0])
  expect(location().pathname).toBe("/channels")
})

it("open(question) opens the panel and sends the question exactly once", async () => {
  let calls = 0
  mockApi({
    "POST /api/v1/agent/messages": () => {
      calls += 1
      return Response.json(answerFixture, { status: 201 })
    },
  })
  mount({ question: "Why do leads stall before the application?" })
  await userEvent.click(screen.getByRole("button", { name: "Open agent" }))

  expect(await screen.findByText("Why do leads stall before the application?")).toBeInTheDocument()
  await waitFor(() => expect(calls).toBe(1))
})

it("a 409 shows 'Still working on your last question.'", async () => {
  mockApi({ "POST /api/v1/agent/messages": () => Response.json({ error: { code: "already_in_progress", message: "x" } }, { status: 409 }) })
  mount()
  await openFab()
  await userEvent.click(await screen.findByRole("button", { name: OWNER_CHIPS[0] }))
  expect(await screen.findByRole("alert")).toHaveTextContent("Still working on your last question.")
})

it("a 502 keeps the typed question", async () => {
  mockApi({ "POST /api/v1/agent/messages": () => Response.json({ error: { code: "model_unavailable", message: "x" } }, { status: 502 }) })
  mount()
  await openFab()
  await ask("hello there")
  expect(await screen.findByRole("alert")).toHaveTextContent("I couldn't reach the model. Try again.")
  expect(screen.getByLabelText("Ask about your business")).toHaveValue("hello there")
})

it("a 422 text_too_long shows the inline 500-character counter", async () => {
  mockApi({ "POST /api/v1/agent/messages": () => Response.json({ error: { code: "text_too_long", message: "x" } }, { status: 422 }) })
  mount()
  await openFab()
  const input = await screen.findByLabelText("Ask about your business")
  await userEvent.click(input)
  await userEvent.paste("x".repeat(501))

  expect(screen.getByTestId("agent-counter")).toHaveTextContent("501/500")
  await userEvent.click(screen.getByRole("button", { name: "Send" }))
  expect(await screen.findByRole("alert")).toHaveTextContent("Keep it under 500 characters.")
})

it("renders the model's text as text, never as HTML", async () => {
  mockApi({
    "POST /api/v1/agent/messages": () =>
      Response.json({ conversation_id: "c1", message: { id: "m1", role: "assistant", body: { text: '<img src="x" onerror="doThing()">' } } }, { status: 201 }),
  })
  mount()
  await openFab()
  await ask("hi")
  expect(await screen.findByText('<img src="x" onerror="doThing()">')).toBeInTheDocument()
})

it("Esc closes the panel and returns focus to the FAB", async () => {
  mount()
  await openFab()
  expect(await screen.findByRole("dialog")).toBeInTheDocument()

  await userEvent.keyboard("{Escape}")
  expect(screen.queryByRole("dialog")).toBeNull()
  expect(screen.getByRole("button", { name: "Ask Simbe" })).toHaveFocus()
})

it("hides the FAB while the lead panel is open and while the agent itself is open", async () => {
  renderWithProviders(
    <AgentProvider>
      <AgentFab />
    </AgentProvider>,
    { route: "/?lead=abc" },
  )
  expect(screen.queryByRole("button", { name: "Ask Simbe" })).toBeNull()

  mount()
  await openFab()
  expect(await screen.findByRole("dialog")).toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "Ask Simbe" })).toBeNull()
})

it("is a full-screen panel on a phone", async () => {
  mount({ viewport: 390 })
  await openFab()
  expect(await screen.findByRole("dialog")).toHaveAttribute("data-variant", "full")
})

it("is a floating bottom-right panel on desktop", async () => {
  mount({ viewport: 1280 })
  await openFab()
  expect(await screen.findByRole("dialog")).toHaveAttribute("data-variant", "panel")
})

it("shows the coordinator's three chips", async () => {
  mount({ role: "coordinator" })
  await openFab()
  expect(await screen.findByText("How can I help this week?")).toBeInTheDocument()
  for (const chip of COORDINATOR_CHIPS) expect(await screen.findByRole("button", { name: chip })).toBeInTheDocument()
})

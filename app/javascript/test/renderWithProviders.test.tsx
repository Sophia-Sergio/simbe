import { screen, waitFor } from "@testing-library/react"
import { useEffect } from "react"
import type { ReactNode } from "react"
import { useParams } from "react-router-dom"
import { useAgent } from "@/app/agent"
import { useLeadPanel } from "@/app/leadPanel"
import { useAuth } from "@/app/auth/useAuth"
import { useIsDesktop } from "@/hooks/useIsDesktop"
import { db } from "@/mocks/db"
import { renderWithProviders } from "./renderWithProviders"

function Probe() {
  const { role, status } = useAuth()
  const desktop = useIsDesktop()
  const agent = useAgent()
  const params = useParams()
  return (
    <div>
      <span data-testid="role">{`${status}:${role}`}</span>
      <span data-testid="desktop">{String(desktop)}</span>
      <span data-testid="agent">{String(agent.isOpen)}</span>
      <span data-testid="id">{params.id ?? "-"}</span>
    </div>
  )
}

function LeadProbe() {
  const panel = useLeadPanel()
  return <span>{`hasNext:${panel.hasNext}`}</span>
}

it("defaults to an owner session on desktop", async () => {
  renderWithProviders(<Probe />)
  await waitFor(() => expect(screen.getByTestId("role")).toHaveTextContent("authenticated:owner"))
  expect(screen.getByTestId("desktop")).toHaveTextContent("true")
  expect(screen.getByTestId("agent")).toHaveTextContent("false")
})

it("role: coordinator signs in as the coordinator, null is signed out", async () => {
  renderWithProviders(<Probe />, { role: "coordinator" })
  await waitFor(() => expect(screen.getByTestId("role")).toHaveTextContent("authenticated:coordinator"))
})

it("role: null renders signed out", async () => {
  renderWithProviders(<Probe />, { role: null })
  await waitFor(() => expect(screen.getByTestId("role")).toHaveTextContent("anonymous:null"))
})

it("route + path produce params, navigate and location work", async () => {
  const { navigate, location } = renderWithProviders(<Probe />, { route: "/leads/42", path: "/leads/:id" })
  expect(screen.getByTestId("id")).toHaveTextContent("42")
  expect(location().pathname).toBe("/leads/42")
  navigate("/leads/43")
  await waitFor(() => expect(screen.getByTestId("id")).toHaveTextContent("43"))
  expect(location().pathname).toBe("/leads/43")
})

it("viewport: 390 makes useIsDesktop false", () => {
  renderWithProviders(<Probe />, { viewport: 390 })
  expect(screen.getByTestId("desktop")).toHaveTextContent("false")
})

it("agentOpen provides an open agent", () => {
  renderWithProviders(<Probe />, { agentOpen: true })
  expect(screen.getByTestId("agent")).toHaveTextContent("true")
})

it("features contribute providers (ordered) and overlays", () => {
  const P = (id: string) =>
    function P({ children }: { children: ReactNode }) {
      return <div data-testid={id}>{children}</div>
    }
  renderWithProviders(<Probe />, {
    features: [
      { id: "x", providers: [{ id: "second", order: 2, component: P("second") }], overlays: [{ id: "o", component: () => <i>overlay</i> }] },
      { id: "y", providers: [{ id: "first", order: 1, component: P("first") }] },
    ],
  })
  expect(screen.getByTestId("first")).toContainElement(screen.getByTestId("second"))
  expect(screen.getByText("overlay")).toBeInTheDocument()
})

it("two renders do not share cache or mock db", async () => {
  const first = renderWithProviders(<Probe />)
  first.queryClient.setQueryData(["marker"], 1)
  db.completions.add("lead-1")
  first.unmount()
  const second = renderWithProviders(<Probe />)
  expect(second.queryClient.getQueryData(["marker"])).toBeUndefined()
  expect(db.completions.size).toBe(0)
})

it("two renders do not share the lead panel ids", () => {
  function Seed() {
    const { setIds } = useLeadPanel()
    useEffect(() => {
      setIds(["a", "b", "c"])
    }, [setIds])
    return null
  }
  const first = renderWithProviders(<Seed />, { route: "/pipeline?lead=b" })
  first.unmount()
  const second = renderWithProviders(<LeadProbe />, { route: "/pipeline?lead=b" })
  expect(second.container).toHaveTextContent("hasNext:false")
})

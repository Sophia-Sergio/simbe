import { QueryClient } from "@tanstack/react-query"
import { render, screen, within } from "@testing-library/react"
import { RouterProvider } from "react-router-dom"
import type { ReactNode } from "react"
import { asRole, setViewport } from "@/test/mockApi"
import type { FeatureModule } from "./feature"
import { Providers } from "./Providers"
import { buildRegistry } from "./registry"
import { createAppRouter } from "./router"
import { Home } from "lucide-react"

const Provider = (id: string) =>
  function P({ children }: { children: ReactNode }) {
    return <div data-testid={id}>{children}</div>
  }

const featureA: FeatureModule = {
  id: "a",
  routes: [
    { path: "a", element: <div>screen A</div>, handle: { title: "Alpha" } },
    { path: "owner-only", element: <div>owner screen</div>, handle: { roles: ["owner"], title: "Owner" } },
    { path: "next-actions", element: <div>coordinator home</div>, handle: { roles: ["coordinator"] } },
    { index: true, element: <div>owner home</div>, handle: { roles: ["owner"] } },
  ],
  nav: [{ id: "a", label: "A", icon: Home, section: "insights", roles: ["owner", "coordinator"], order: 1, to: "/a" }],
  overlays: [{ id: "o", component: () => <div data-testid="overlay">overlay</div> }],
  providers: [{ id: "p2", order: 2, component: Provider("p2") }],
}
const featureB: FeatureModule = {
  id: "b",
  nav: [
    { id: "b", label: "B", icon: Home, section: "insights", roles: ["owner"], order: 2, to: "/b" },
    { id: "c", label: "C", icon: Home, section: "operations", roles: ["coordinator"], order: 3, to: "/c" },
  ],
  providers: [{ id: "p1", order: 1, component: Provider("p1") }],
  publicRoutes: [
    { path: "/public", element: <div>public screen</div> },
    { path: "/signin", element: <div>signin screen</div> },
  ],
}

function mount(route: string, { role = "owner", width = 1280 }: { role?: "owner" | "coordinator" | null; width?: number } = {}) {
  asRole(role)
  setViewport(width)
  const router = createAppRouter(buildRegistry([featureA, featureB]), { initialEntries: [route] })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <Providers queryClient={queryClient}>
      <RouterProvider router={router} />
    </Providers>,
  )
  return router
}

it("renders a route inside the shell with role-filtered nav, one overlay and ordered providers", async () => {
  mount("/a")
  expect(await screen.findByText("screen A")).toBeInTheDocument()
  const shell = document.querySelector("[data-shell]") as HTMLElement
  expect(shell).toHaveAttribute("data-shell", "desktop")
  const nav = within(screen.getByRole("navigation", { name: "Primary" }))
  expect(nav.getByText("A")).toBeInTheDocument()
  expect(nav.getByText("B")).toBeInTheDocument()
  expect(nav.queryByText("C")).toBeNull()
  expect(screen.getAllByTestId("overlay")).toHaveLength(1)
  expect(screen.getByTestId("p1")).toContainElement(screen.getByTestId("p2"))
  expect(within(shell).getByRole("heading", { level: 1 })).toHaveTextContent("Alpha")
})

it("redirects a coordinator away from an owner-only route without rendering it", async () => {
  const router = mount("/owner-only", { role: "coordinator" })
  expect(await screen.findByText("coordinator home")).toBeInTheDocument()
  expect(screen.queryByText("owner screen")).toBeNull()
  expect(router.state.location.pathname).toBe("/next-actions")
})

it("redirects an owner away from a coordinator-only route to /", async () => {
  const router = mount("/next-actions", { role: "owner" })
  expect(await screen.findByText("owner home")).toBeInTheDocument()
  expect(screen.queryByText("coordinator home")).toBeNull()
  expect(router.state.location.pathname).toBe("/")
})

it("renders NotFound inside the shell for an unknown path", async () => {
  mount("/nope")
  expect(await screen.findByText("Page not found")).toBeInTheDocument()
  expect(document.querySelector("[data-shell]")).not.toBeNull()
})

it("sends an anonymous visitor to sign-in with ?next and serves public routes without a session", async () => {
  const router = mount("/a", { role: null })
  await vi.waitFor(() => expect(router.state.location.pathname).toBe("/signin"))
  expect(router.state.location.search).toBe("?next=%2Fa")
})

it("serves a public route without a session", async () => {
  mount("/public", { role: null })
  expect(await screen.findByText("public screen")).toBeInTheDocument()
})

it("switches shell by viewport", async () => {
  mount("/a", { width: 500 })
  await screen.findByText("screen A")
  expect(document.querySelector("[data-shell]")).toHaveAttribute("data-shell", "mobile")
})

it("signs out to a clean /signin", async () => {
  const router = mount("/a")
  const signOut = await screen.findByRole("button", { name: "Sign out" })
  signOut.click()
  await vi.waitFor(() => expect(router.state.location.pathname).toBe("/signin"))
  await vi.waitFor(() => expect(router.state.location.search).toBe(""))
})

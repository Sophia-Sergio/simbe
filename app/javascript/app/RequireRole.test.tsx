import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom"
import { asRole } from "@/test/mockApi"
import { AuthProvider } from "./auth/AuthProvider"
import { RequireAuth } from "./RequireAuth"
import { RequireRole } from "./RequireRole"

function renderGate(ui: ReactNode, { route = "/" }: { route?: string } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <AuthProvider>{ui}</AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>
}

function guarded(path: string, roles: ("owner" | "coordinator")[], label: string) {
  return (
    <Route
      path={path}
      element={
        <RequireAuth>
          <RequireRole roles={roles}>
            <div>{label}</div>
          </RequireRole>
        </RequireAuth>
      }
    />
  )
}

it("redirects a coordinator from an owner-only route to /next-actions", async () => {
  asRole("coordinator")
  renderGate(
    <>
      <LocationProbe />
      <Routes>
        {guarded("/", ["owner"], "owner home")}
        <Route path="/next-actions" element={<div>next actions</div>} />
      </Routes>
    </>,
  )

  await screen.findByText("next actions")
  expect(screen.queryByText("owner home")).toBeNull()
  expect(screen.getByTestId("location")).toHaveTextContent("/next-actions")
})

it("redirects an owner from a coordinator-only route to /", async () => {
  asRole("owner")
  renderGate(
    <>
      <LocationProbe />
      <Routes>
        <Route path="/" element={<div>owner home</div>} />
        {guarded("/next-actions", ["coordinator"], "next actions")}
      </Routes>
    </>,
    { route: "/next-actions" },
  )

  await screen.findByText("owner home")
  expect(screen.queryByText("next actions")).toBeNull()
  expect(screen.getByTestId("location")).toHaveTextContent("/")
})

it("renders children for an allowed role", async () => {
  asRole("owner")
  renderGate(<Routes>{guarded("/", ["owner", "coordinator"], "shared screen")}</Routes>)

  expect(await screen.findByText("shared screen")).toBeInTheDocument()
})

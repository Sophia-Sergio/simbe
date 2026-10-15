import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom"
import { asRole } from "@/test/mockApi"
import { AuthProvider } from "./auth/AuthProvider"
import { RequireAuth } from "./RequireAuth"

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

it("shows a full-screen skeleton while the session resolves", () => {
  asRole("owner")
  renderGate(
    <RequireAuth>
      <div>secret</div>
    </RequireAuth>,
  )
  expect(screen.getByTestId("skeleton")).toBeInTheDocument()
  expect(screen.queryByText("secret")).toBeNull()
})

it("redirects anonymous users to /signin with the attempted path in ?next", async () => {
  asRole(null)
  renderGate(
    <>
      <LocationProbe />
      <Routes>
        <Route
          path="/pipeline"
          element={
            <RequireAuth>
              <div>secret</div>
            </RequireAuth>
          }
        />
        <Route path="/signin" element={<div>signin screen</div>} />
      </Routes>
    </>,
    { route: "/pipeline" },
  )

  await screen.findByText("signin screen")
  expect(screen.queryByText("secret")).toBeNull()
  expect(screen.getByTestId("location")).toHaveTextContent("/signin?next=%2Fpipeline")
})

it("renders children when authenticated", async () => {
  asRole("owner")
  renderGate(
    <Routes>
      <Route
        path="/pipeline"
        element={
          <RequireAuth>
            <div>secret</div>
          </RequireAuth>
        }
      />
    </Routes>,
    { route: "/pipeline" },
  )

  expect(await screen.findByText("secret")).toBeInTheDocument()
  expect(screen.queryByTestId("skeleton")).toBeNull()
})

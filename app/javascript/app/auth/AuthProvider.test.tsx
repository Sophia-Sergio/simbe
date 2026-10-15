import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query"
import { act, render, screen, waitFor } from "@testing-library/react"
import { useEffect } from "react"
import type { ReactNode } from "react"
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom"
import { jsonRequest } from "@/api/client"
import { jsonError } from "@/mocks/handlers/shared"
import { asRole, mockApi } from "@/test/mockApi"
import { RequireAuth } from "../RequireAuth"
import { AuthProvider } from "./AuthProvider"
import type { Auth } from "./AuthProvider"
import { useAuth } from "./useAuth"

function renderWithAuth(ui: ReactNode, { route = "/" }: { route?: string } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <AuthProvider>{ui}</AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { ...rendered, queryClient }
}

function StatusProbe({ onAuth }: { onAuth: (auth: Auth) => void }) {
  const auth = useAuth()
  useEffect(() => {
    onAuth(auth)
  }, [auth, onAuth])
  return <div data-testid="status">{auth.status}</div>
}

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>
}

it("goes loading → anonymous on 401 and authenticated after signIn", async () => {
  asRole(null)
  let auth: Auth | null = null
  renderWithAuth(<StatusProbe onAuth={(value) => (auth = value)} />)

  expect(screen.getByTestId("status")).toHaveTextContent("loading")
  await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anonymous"))

  await act(async () => {
    await auth!.signIn("erin@harbor.test", "x")
  })

  await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"))
  expect(auth!.user?.email).toBe("erin@harbor.test")
  expect(auth!.agency?.slug).toBe("harbor")
  expect(auth!.role).toBe("owner")
})

it("a 401 on a data query while authenticated returns to sign-in once", async () => {
  asRole("owner")
  mockApi({ "GET /api/v1/metrics/summary?range=30d": () => jsonError(401, "unauthenticated", "Sign in required") })

  const visited: string[] = []
  function Tracker() {
    const location = useLocation()
    useEffect(() => {
      visited.push(`${location.pathname}${location.search}`)
    }, [location])
    return null
  }
  function SummaryProbe() {
    useQuery({
      queryKey: ["metrics", "summary", "expiring"],
      queryFn: ({ signal }) => jsonRequest("GET", "/api/v1/metrics/summary?range=30d", undefined, signal),
    })
    return <div>pipeline screen</div>
  }

  renderWithAuth(
    <>
      <Tracker />
      <LocationProbe />
      <Routes>
        <Route
          path="/pipeline"
          element={
            <RequireAuth>
              <SummaryProbe />
            </RequireAuth>
          }
        />
        <Route path="/signin" element={<div>signin screen</div>} />
      </Routes>
    </>,
    { route: "/pipeline" },
  )

  await screen.findByText("signin screen")
  expect(screen.getByTestId("location")).toHaveTextContent("/signin?next=%2Fpipeline")
  expect(screen.queryByText("pipeline screen")).toBeNull()
  // The redirect fired once: the app never bounced back to /pipeline after landing on /signin.
  expect(visited.filter((entry) => entry === "/pipeline")).toHaveLength(1)
})

it("signOut clears cached data and signs out", async () => {
  asRole("owner")
  let auth: Auth | null = null
  const { queryClient } = renderWithAuth(<StatusProbe onAuth={(value) => (auth = value)} />)
  await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"))

  queryClient.setQueryData(["metrics", "summary", "30d"], { kpis: true })
  await act(async () => {
    await auth!.signOut()
  })

  expect(queryClient.getQueryData(["metrics", "summary", "30d"])).toBeUndefined()
  await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anonymous"))
})

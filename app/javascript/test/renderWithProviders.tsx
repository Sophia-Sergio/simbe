import { QueryClient } from "@tanstack/react-query"
import { act, render } from "@testing-library/react"
import type { RenderResult } from "@testing-library/react"
import { useEffect } from "react"
import type { ReactElement, ReactNode } from "react"
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom"
import type { Location, NavigateFunction } from "react-router-dom"
import { AgentContext } from "@/app/agent"
import { resetLeadPanelIds } from "@/app/leadPanel"
import type { FeatureModule } from "@/app/feature"
import { Providers } from "@/app/Providers"
import { buildRegistry } from "@/app/registry"
import { SearchPaletteProvider } from "@/app/searchPalette"
import { db } from "@/mocks/db"
import { asRole, setViewport } from "./mockApi"

export type RenderWithProvidersOptions = {
  route?: string
  path?: string // wraps `ui` in a Route so useParams works
  role?: "owner" | "coordinator" | null // mock session; default owner, null = signed out
  viewport?: number // default 1280 (desktop)
  agentOpen?: boolean
  features?: FeatureModule[] // extra feature providers/overlays for the test
}

export type RenderWithProvidersResult = RenderResult & {
  queryClient: QueryClient
  navigate: (to: string) => void
  location: () => Location
}

/**
 * The one way feature tests mount a screen: mock session, viewport, a fresh QueryClient and mock
 * db, the provider stack (Query > Toast > Auth > SearchPalette > feature providers) and a memory
 * router at `route`.
 */
export function renderWithProviders(
  ui: ReactElement,
  { route = "/", path, role = "owner", viewport = 1280, agentOpen = false, features = [] }: RenderWithProvidersOptions = {},
): RenderWithProvidersResult {
  db.reset()
  resetLeadPanelIds()
  asRole(role)
  setViewport(viewport)

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const registry = buildRegistry(features)
  const probe: { navigate: NavigateFunction | null; location: Location | null } = { navigate: null, location: null }

  function Probe() {
    const navigate = useNavigate()
    const location = useLocation()
    useEffect(() => {
      probe.navigate = navigate
      probe.location = location
    })
    return null
  }

  const content: ReactNode = path ? (
    <Routes>
      <Route path={path} element={ui} />
    </Routes>
  ) : (
    ui
  )
  const body = registry.providers.reduceRight<ReactNode>(
    (children, provider) => <provider.component key={provider.id}>{children}</provider.component>,
    <>
      {content}
      {registry.overlays.map((overlay) => (
        <overlay.component key={overlay.id} />
      ))}
    </>,
  )

  const rendered = render(
    <Providers queryClient={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <AgentContext.Provider value={{ isOpen: agentOpen, open: () => {}, close: () => {} }}>
          <SearchPaletteProvider>
            <Probe />
            {body}
          </SearchPaletteProvider>
        </AgentContext.Provider>
      </MemoryRouter>
    </Providers>,
  )

  return {
    ...rendered,
    queryClient,
    navigate: (to) => {
      act(() => {
        void probe.navigate?.(to)
      })
    },
    location: () => probe.location as Location,
  }
}

import type { ReactNode } from "react"
import { createBrowserRouter, createMemoryRouter, Outlet } from "react-router-dom"
import type { RouteObject } from "react-router-dom"
import type { Role } from "./feature"
import { AppShell } from "./AppShell"
import { NotFound } from "./NotFound"
import { registry as defaultRegistry } from "./registry"
import type { Registry } from "./shell/types"
import { RequireAuth } from "./RequireAuth"
import { RequireRole } from "./RequireRole"
import { SearchPaletteProvider } from "./searchPalette"

/** Root layout: the router-dependent providers, outermost first (feature providers sorted by `order`). */
function RouterProviders({ registry }: { registry: Registry }) {
  const inner = registry.providers.reduceRight<ReactNode>(
    (children, provider) => <provider.component key={provider.id}>{children}</provider.component>,
    <Outlet />,
  )
  return <SearchPaletteProvider>{inner}</SearchPaletteProvider>
}

const rolesOf = (route: RouteObject): Role[] | undefined => (route.handle as { roles?: Role[] } | undefined)?.roles

/** A route that declares `handle.roles` renders through RequireRole; a wrong role never sees the screen. */
const guarded = (route: RouteObject): RouteObject => {
  const roles = rolesOf(route)
  if (!roles) return route
  return { ...route, element: <RequireRole roles={roles}>{route.element ?? <Outlet />}</RequireRole> } as RouteObject
}

export function createAppRouter(registry: Registry = defaultRegistry, options: { initialEntries?: string[] } = {}) {
  const routes: RouteObject[] = [
    {
      element: <RouterProviders registry={registry} />,
      children: [
        ...registry.publicRoutes,
        {
          path: "/",
          element: (
            <RequireAuth>
              <AppShell registry={registry} />
            </RequireAuth>
          ),
          children: [...registry.routes.map(guarded), { path: "*", element: <NotFound /> }],
        },
      ],
    },
  ]
  return options.initialEntries ? createMemoryRouter(routes, { initialEntries: options.initialEntries }) : createBrowserRouter(routes)
}

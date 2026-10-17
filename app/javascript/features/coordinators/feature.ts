import { UserCheck } from "lucide-react"
import { createElement, lazy, Suspense } from "react"
import type { FeatureModule } from "../../app/feature"

// Lazy for the same reason as `_kit`/`auth`: `app/registry.test.ts` loads every `features/*/feature.ts`
// through a Vite server with no `@` alias, so feature.ts must stay import-light (bare packages,
// relative paths, type-only imports) and the pages load on demand.
const CoordinatorsPage = lazy(() => import("./CoordinatorsPage").then((module) => ({ default: module.CoordinatorsPage })))
const CoordinatorPage = lazy(() => import("./CoordinatorPage").then((module) => ({ default: module.CoordinatorPage })))
const page = (Component: typeof CoordinatorsPage) => createElement(Suspense, { fallback: null }, createElement(Component))

// Owner-only. The two routes are declaratively gated with `handle.roles`; the app core redirects a
// coordinator to /next-actions before either screen (and so either API call) renders.
export const feature: FeatureModule = {
  id: "coordinators",
  routes: [
    { path: "coordinators", element: page(CoordinatorsPage), handle: { roles: ["owner"], title: "Coordinators" } },
    { path: "coordinators/:name", element: page(CoordinatorPage), handle: { roles: ["owner"], title: "Coordinator" } },
  ],
  nav: [
    {
      id: "coordinators",
      label: "Coordinators",
      icon: UserCheck,
      section: "operations",
      roles: ["owner"],
      order: 50,
      to: "/coordinators",
      mobile: { more: { order: 2 } },
    },
  ],
}

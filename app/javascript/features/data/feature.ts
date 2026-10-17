import { Database } from "lucide-react"
import { createElement, lazy, Suspense } from "react"
import type { FeatureModule } from "../../app/feature"

// Lazy for the same reason as the other features: `app/registry.test.ts` loads every `features/*/feature.ts`
// through a Vite server with no `@` alias, so feature.ts must stay import-light (bare packages, relative
// paths, type-only imports) and the page loads on demand.
const DataSourcesPage = lazy(() => import("./DataSourcesPage").then((module) => ({ default: module.DataSourcesPage })))
const page = createElement(Suspense, { fallback: null }, createElement(DataSourcesPage))

// Owner-only (spec decision 8). The declarative `handle.roles` gate redirects a coordinator to /next-actions.
export const feature: FeatureModule = {
  id: "data",
  routes: [{ path: "data", element: page, handle: { roles: ["owner"], title: "Data sources" } }],
  nav: [
    {
      id: "data",
      label: "Data sources",
      icon: Database,
      section: "agency",
      roles: ["owner"],
      order: 60,
      to: "/data",
      mobile: { more: { order: 3 } },
    },
  ],
}

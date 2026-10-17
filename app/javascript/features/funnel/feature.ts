import { Filter } from "lucide-react"
import { createElement, lazy, Suspense } from "react"
import type { FeatureModule } from "../../app/feature"

// Lazy: the registry spec loads every feature.ts through a Vite server with no `@` alias.
const FunnelPage = lazy(() => import("./FunnelPage").then((module) => ({ default: module.FunnelPage })))

export const feature: FeatureModule = {
  id: "funnel",
  routes: [
    {
      path: "funnel",
      element: createElement(Suspense, { fallback: null }, createElement(FunnelPage)),
      handle: { roles: ["owner"], title: "Funnel" },
    },
  ],
  nav: [
    {
      id: "funnel",
      label: "Funnel",
      icon: Filter,
      section: "insights",
      roles: ["owner"],
      order: 20,
      to: "/funnel",
      mobile: { more: { order: 1 } },
    },
  ],
}

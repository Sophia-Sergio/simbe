import { Home } from "lucide-react"
import { createElement, lazy, Suspense } from "react"
import type { FeatureModule } from "../../app/feature"

// Lazy for the same reason as `_kit`: the registry spec loads every feature.ts through a Vite server with no `@` alias.
const WeekPage = lazy(() => import("./WeekPage").then((module) => ({ default: module.WeekPage })))

export const feature: FeatureModule = {
  id: "week",
  routes: [
    {
      index: true,
      element: createElement(Suspense, { fallback: null }, createElement(WeekPage)),
      handle: { roles: ["owner"], title: "This week" },
    },
  ],
  nav: [
    {
      id: "week",
      label: "This week",
      icon: Home,
      section: "insights",
      roles: ["owner"],
      order: 10,
      to: "/",
      mobile: { tab: { order: 1, label: "Home" } },
    },
  ],
}

import { Plug } from "lucide-react"
import { createElement, lazy, Suspense } from "react"
import type { FeatureModule } from "../../app/feature"

// Lazy: the registry spec loads every feature.ts through a Vite server with no `@` alias.
const ConnectPage = lazy(() => import("./ConnectPage").then((module) => ({ default: module.ConnectPage })))

export const feature: FeatureModule = {
  id: "connect",
  routes: [
    {
      path: "connect",
      element: createElement(Suspense, { fallback: null }, createElement(ConnectPage)),
      handle: { roles: ["owner"], title: "Connect Claude" },
    },
  ],
  nav: [
    {
      id: "connect",
      label: "Connect Claude",
      icon: Plug,
      section: "agency",
      roles: ["owner"],
      order: 70,
      to: "/connect",
      mobile: { more: { order: 4 } },
    },
  ],
}

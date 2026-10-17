import { Sliders } from "lucide-react"
import { createElement, lazy, Suspense } from "react"
import type { FeatureModule } from "../../app/feature"

// Lazy: the registry spec loads every feature.ts through a Vite server with no `@` alias.
const SettingsPage = lazy(() => import("./SettingsPage").then((module) => ({ default: module.SettingsPage })))
const AcceptInvitePage = lazy(() => import("./AcceptInvitePage").then((module) => ({ default: module.AcceptInvitePage })))

export const feature: FeatureModule = {
  id: "settings",
  routes: [
    {
      path: "settings",
      element: createElement(Suspense, { fallback: null }, createElement(SettingsPage)),
      handle: { roles: ["owner"], title: "Settings" },
    },
  ],
  // The accept-invitation screen is public: the token lives in the URL, there is no session yet.
  publicRoutes: [
    {
      path: "/invite/:token",
      element: createElement(Suspense, { fallback: null }, createElement(AcceptInvitePage)),
    },
  ],
  nav: [
    {
      id: "settings",
      label: "Settings",
      icon: Sliders,
      section: "agency",
      roles: ["owner"],
      order: 80,
      to: "/settings",
      mobile: { more: { order: 5 } },
    },
  ],
}

import { createElement, lazy, Suspense } from "react"
import { CheckSquare } from "lucide-react"
import type { FeatureModule } from "@/app/feature"
import { useNextActionsBadge } from "./useNavBadge"

// Loaded lazily for the same reason as `_kit`/`auth`: `app/registry.test.ts` loads every
// `features/*/feature.ts` through a Vite server with no `@` alias, so feature.ts must stay
// import-light (bare packages, relative paths, type-only imports).
const NextActionsPage = lazy(() => import("./NextActionsPage").then((module) => ({ default: module.NextActionsPage })))

export const feature: FeatureModule = {
  id: "next-actions",
  routes: [
    {
      path: "next-actions",
      element: createElement(Suspense, { fallback: null }, createElement(NextActionsPage)),
      handle: { roles: ["coordinator"], title: "Next actions" },
    },
  ],
  nav: [
    {
      id: "next-actions",
      label: "Next actions",
      icon: CheckSquare,
      section: "today",
      roles: ["coordinator"],
      order: 10,
      to: "/next-actions",
      useBadge: useNextActionsBadge,
      mobile: { tab: { order: 1 } },
    },
  ],
}

import { Kanban, UserCheck } from "lucide-react"
import { createElement, lazy, Suspense } from "react"
import type { FeatureModule } from "@/app/feature"
// Relative on purpose (like the lazy page below): the registry spec loads every feature.ts through a Vite
// server built with `configFile: false`, which has no `@` alias, so only the lazy import may use `@/…`.
import { useBoard } from "../../api/hooks/leads"

const PipelinePage = lazy(() => import("./PipelinePage").then((module) => ({ default: module.PipelinePage })))

export const feature: FeatureModule = {
  id: "pipeline",
  routes: [
    {
      path: "pipeline",
      element: createElement(Suspense, { fallback: null }, createElement(PipelinePage)),
      handle: { roles: ["owner", "coordinator"], title: "Pipeline" },
    },
  ],
  nav: [
    {
      id: "pipeline",
      label: "Pipeline",
      icon: Kanban,
      section: "operations",
      roles: ["owner"],
      order: 40,
      to: "/pipeline",
      useBadge: () => useBoard().data?.columns.action_needed.count,
      mobile: { tab: { order: 2 } },
    },
    {
      id: "my-leads",
      label: "My leads",
      icon: UserCheck,
      section: "today",
      roles: ["coordinator"],
      order: 20,
      to: "/pipeline",
      mobile: { tab: { order: 2 } },
    },
  ],
}

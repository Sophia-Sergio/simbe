import { createElement, lazy, Suspense } from "react"
import type { FeatureModule } from "@/app/feature"

// Lazy for the same reason as `auth`/`_kit`: the registry spec loads every feature.ts through a Vite
// server with no `@` alias, so a static import of the panel (and of the kit it composes) would fail there.
const LeadPanel = lazy(() => import("./LeadPanel").then((module) => ({ default: module.LeadPanelOverlay })))

function Overlay() {
  return createElement(Suspense, { fallback: null }, createElement(LeadPanel))
}

// No routes and no nav: any screen opens the panel through `useLeadPanel().open(id, tab?)` (URL `?lead=&tab=`).
export const feature: FeatureModule = {
  id: "lead-panel",
  overlays: [{ id: "lead-panel", component: Overlay }],
}

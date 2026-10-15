import { createElement, lazy, Suspense } from "react"
import type { FeatureModule } from "@/app/feature"

// Dev and e2e only: never registered in a production build.
const enabled = import.meta.env.DEV || import.meta.env.MODE === "e2e"

// Loaded lazily so `features/*/feature.ts` stays import-light: the scaffold's registry spec
// (`app/javascript/app/registry.test.ts`) loads every feature through a Vite server with
// `configFile: false`, which has no `@` alias, so a static import of the gallery (and of the
// kit components it uses) would fail there.
const KitGallery = lazy(() => import("./KitGallery").then((module) => ({ default: module.KitGallery })))

export const feature: FeatureModule = {
  id: "_kit",
  publicRoutes: enabled ? [{ path: "/__kit", element: createElement(Suspense, { fallback: null }, createElement(KitGallery)) }] : [],
}

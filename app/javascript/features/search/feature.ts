import { createElement, lazy, Suspense } from "react"
import type { FeatureModule } from "../../app/feature"

// Lazy for the same reason as `lead-panel`/`_kit`: `app/registry.test.ts` loads every
// `features/*/feature.ts` through a Vite server with no `@` alias, so feature.ts must stay
// import-light and the palette (and the kit it composes) loads on demand.
const SearchPalette = lazy(() => import("./SearchPalette").then((module) => ({ default: module.SearchPalette })))

function Overlay() {
  return createElement(Suspense, { fallback: null }, createElement(SearchPalette))
}

// No routes and no nav: the top bar / Cmd-Ctrl+K open it through `useSearchPalette()`, and the
// overlay renders only while that state is open.
export const feature: FeatureModule = {
  id: "search",
  overlays: [{ id: "search-palette", component: Overlay }],
}

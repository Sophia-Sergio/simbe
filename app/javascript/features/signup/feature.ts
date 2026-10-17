import { createElement, lazy, Suspense } from "react"
import type { FeatureModule } from "@/app/feature"

// Lazy for the same reason as `auth`: the registry spec loads every feature.ts through a Vite server
// with no `@` alias, so only the import inside `lazy` may use `@/…`.
const SignUpPage = lazy(() => import("./SignUpPage").then((module) => ({ default: module.SignUpPage })))

export const feature: FeatureModule = {
  id: "signup",
  publicRoutes: [{ path: "/signup", element: createElement(Suspense, { fallback: null }, createElement(SignUpPage)) }],
}

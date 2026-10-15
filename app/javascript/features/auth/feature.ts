import { createElement, lazy, Suspense } from "react"
import type { FeatureModule } from "@/app/feature"

// Lazy for the same reason as `_kit`: the registry spec loads every feature.ts through a Vite server with no `@` alias.
const SignInPage = lazy(() => import("./SignInPage").then((module) => ({ default: module.SignInPage })))

export const feature: FeatureModule = {
  id: "auth",
  publicRoutes: [{ path: "/signin", element: createElement(Suspense, { fallback: null }, createElement(SignInPage)) }],
}

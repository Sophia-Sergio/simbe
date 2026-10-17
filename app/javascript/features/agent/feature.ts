import { Sparkles } from "lucide-react"
import { createElement, lazy, Suspense } from "react"
import type { ComponentType } from "react"
import { useAgent } from "../../app/agent"
import type { FeatureModule } from "../../app/feature"
import { AgentProvider } from "./AgentProvider"

// Lazy for the same reason as `_kit`/`auth`: `app/registry.test.ts` loads every `features/*/feature.ts`
// through a Vite server with no `@` alias, so feature.ts stays import-light (bare packages, relative
// paths, type-only imports) and the kit-importing screens load only when their slot is rendered.
const AgentPanel = lazy(() => import("./AgentPanel").then((module) => ({ default: module.AgentPanel })))
const AgentFab = lazy(() => import("./AgentFab").then((module) => ({ default: module.AgentFab })))

/** Wraps a lazy slot component in its own Suspense boundary (the shell renders slots without one). */
const suspended = (Component: ComponentType) =>
  function Suspended() {
    return createElement(Suspense, { fallback: null }, createElement(Component))
  }

/** The Ask tab's handler: a hook (the registry's `useOnSelect` contract) that opens the agent. */
function useAskSelect(): () => void {
  const agent = useAgent()
  return () => agent.open()
}

export const feature: FeatureModule = {
  id: "agent",
  // Supplies the real useAgent() the insights plan left as a no-op; nothing else in the app changes.
  providers: [{ id: "agent", order: 50, component: AgentProvider }],
  overlays: [{ id: "agent-panel", component: suspended(AgentPanel) }],
  // Desktop only: the mobile shell ignores the `fab` slot and opens the agent from the Ask tab.
  fab: suspended(AgentFab),
  nav: [
    {
      id: "ask",
      label: "Ask",
      icon: Sparkles,
      section: "today",
      roles: ["owner", "coordinator"],
      order: 90,
      desktop: false,
      useOnSelect: useAskSelect,
      mobile: { tab: { order: 4 } },
    },
  ],
}

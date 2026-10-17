import { buildRegistry } from "@/app/registry"
import { feature } from "./feature"

// Mirrors `registry.test.ts`: the feature is discovered by its `feature.ts`, and this spec pins the
// slots it contributes (the Ask tab is the mobile entry point; the FAB is desktop only).
it("registers the provider, the panel overlay, the FAB and the Ask tab", () => {
  const registry = buildRegistry([feature])
  expect(registry.providers.map((provider) => provider.id)).toContain("agent")
  expect(registry.overlays.map((overlay) => overlay.id)).toEqual(["agent-panel"])
  expect(registry.fabs).toHaveLength(1)

  const ask = registry.nav("owner").find((item) => item.id === "ask")
  expect(ask).toMatchObject({ label: "Ask", desktop: false, roles: ["owner", "coordinator"], mobile: { tab: { order: 4 } } })
  expect(registry.nav("coordinator").map((item) => item.id)).toContain("ask")
})

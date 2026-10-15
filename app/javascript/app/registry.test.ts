// @vitest-environment node
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"
import { createServer } from "vite"
import { afterEach, expect, it } from "vitest"
import type { FeatureModule } from "./feature"
import { buildRegistry } from "./registry"

const icon = (() => null) as never
const a: FeatureModule = { id: "a", routes: [{ path: "a", element: null }], nav: [{ id: "a", label: "A", icon, section: "insights", roles: ["owner"], order: 2, to: "/a" }] }
const b: FeatureModule = {
  id: "b",
  nav: [{ id: "b", label: "B", icon, section: "insights", roles: ["owner", "coordinator"], order: 1, to: "/b" }],
  overlays: [{ id: "o", component: () => null }],
  providers: [
    { id: "p2", order: 2, component: ({ children }) => children as never },
    { id: "p1", order: 1, component: ({ children }) => children as never },
  ],
}

it("merges features without a shared file", () => {
  const r = buildRegistry([a, b])
  expect(r.routes.map((x) => x.path)).toEqual(["a"])
  expect(r.nav("owner").map((n) => n.id)).toEqual(["b", "a"]) // sorted by order
  expect(r.nav("coordinator").map((n) => n.id)).toEqual(["b"]) // role filtered
  expect(r.overlays.map((o) => o.id)).toEqual(["o"])
  expect(r.providers.map((p) => p.id)).toEqual(["p1", "p2"]) // sorted by order
})

it("rejects duplicate ids", () => {
  expect(() => buildRegistry([a, { ...a }])).toThrow(/duplicate feature id/i)
})

it("keeps desktop:false items in nav() (filtering is the shells' job)", () => {
  const m: FeatureModule = { id: "m", nav: [{ id: "ask", label: "Ask", icon, section: "today", roles: ["owner"], order: 99, desktop: false, mobile: { tab: { order: 4 } } }] }
  expect(buildRegistry([m]).nav("owner").map((n) => n.id)).toEqual(["ask"])
})

it("works with zero features", () => {
  expect(buildRegistry([]).routes).toEqual([])
})

// The glob is relative to registry.ts, so it must find features whatever the Vite root is:
// vite.config.ts uses the repo root, vite.mock.config.ts uses app/javascript/mock-host.
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../..")
const probeDir = resolve(repo, "app/javascript/features/zz_probe")

afterEach(() => rmSync(probeDir, { recursive: true, force: true }))

it.each([
  ["the repo root (vite.config.ts)", repo],
  ["the mock host root (vite.mock.config.ts)", resolve(repo, "app/javascript/mock-host")],
])("discovers features/*/feature.ts when the Vite root is %s", async (_label, root) => {
  mkdirSync(probeDir, { recursive: true })
  writeFileSync(resolve(probeDir, "feature.ts"), 'export const feature = { id: "zz_probe" }\n')
  const server = await createServer({ configFile: false, root, plugins: [react()], appType: "custom", logLevel: "silent", server: { middlewareMode: true, fs: { allow: [repo] } } })
  try {
    const mod = await server.ssrLoadModule(resolve(repo, "app/javascript/app/registry.ts"))
    expect(mod.registry.features.map((f: FeatureModule) => f.id)).toContain("zz_probe")
  } finally {
    await server.close()
  }
})

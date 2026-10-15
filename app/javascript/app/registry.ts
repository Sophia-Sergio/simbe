import type { FeatureModule, NavItem, Role } from "./feature"

export function buildRegistry(features: FeatureModule[]) {
  const seen = new Set<string>()
  for (const { id } of features) {
    if (seen.has(id)) throw new Error(`Duplicate feature id: ${id}`)
    seen.add(id)
  }
  const collect = <T>(pick: (f: FeatureModule) => T[] | undefined) => features.flatMap((f) => pick(f) ?? [])
  const nav = collect((f) => f.nav)
  const providers = collect((f) => f.providers)
  return {
    features,
    routes: collect((f) => f.routes),
    publicRoutes: collect((f) => f.publicRoutes),
    nav: (role: Role): NavItem[] => nav.filter((n) => n.roles.includes(role)).sort((x, y) => x.order - y.order),
    overlays: collect((f) => f.overlays),
    providers: [...providers].sort((x, y) => x.order - y.order),
    fabs: features.flatMap((f) => (f.fab ? [f.fab] : [])),
    topBarRight: collect((f) => f.topBarRight),
  }
}

// The glob is relative to this file on purpose: a leading-slash glob resolves against the Vite root, which is
// app/javascript/mock-host in vite.mock.config.ts, and would silently find no features there.
const modules = import.meta.glob<{ feature: FeatureModule }>("../features/*/feature.ts", { eager: true })

export const registry = buildRegistry(Object.values(modules).map((m) => m.feature))

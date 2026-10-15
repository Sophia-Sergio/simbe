import { useMemo } from "react"
import type { ComponentType } from "react"
import { BrandMark } from "@/components/ui/BrandMark"

// Contract for a gallery section: `export default` a component, optionally export
// `title` and `order`. W0-4B adds `sections/DataViz.tsx` without touching this file.
type SectionModule = { default?: ComponentType; title?: string; order?: number }

const modules = import.meta.glob<SectionModule>("./sections/*.tsx", { eager: true })

function fallbackTitle(path: string): string {
  return path.replace("./sections/", "").replace(".tsx", "")
}

export function KitGallery() {
  const sections = useMemo(
    () =>
      Object.entries(modules)
        .filter(([, mod]) => Boolean(mod.default))
        .map(([path, mod]) => ({
          path,
          Component: mod.default as ComponentType,
          title: mod.title ?? fallbackTitle(path),
          order: mod.order ?? 100,
          key: fallbackTitle(path),
        }))
        .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title)),
    [],
  )

  return (
    <main className="min-h-screen bg-app px-5 py-8 md:px-8">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-8">
        <header className="flex items-center gap-3">
          <BrandMark size={28} />
          <h1 className="font-display text-2xl font-semibold text-ink">Kit</h1>
        </header>
        {sections.map(({ path, Component, title, key }) => (
          <section key={path} aria-labelledby={`kit-${key}`} className="flex flex-col gap-4">
            <h2 id={`kit-${key}`} className="font-display text-[18px] font-semibold text-ink">
              {title}
            </h2>
            <Component />
          </section>
        ))}
      </div>
    </main>
  )
}

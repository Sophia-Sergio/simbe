import { createElement } from "react"
import { scenario } from "./scenarios"

/**
 * Starts the MSW service worker when the build has mocks enabled. `__MOCKS_ENABLED__` is a build-time
 * constant that is `false` in every Rails build, so this (and the whole mocks chunk) is eliminated from
 * production bundles. W0-5's entrypoint calls it before rendering.
 */
export async function startMocks(): Promise<void> {
  if (!__MOCKS_ENABLED__) return
  const { worker } = await import("./browser")
  await worker.start({ onUnhandledRequest: "bypass" })
}

/** Dev-only corner chip ("Mock API · <scenario>") rendered by W0-5's entrypoint in mock mode. */
export function MockChip() {
  if (!__MOCKS_ENABLED__) return null
  return createElement(
    "div",
    {
      "data-testid": "mock-chip",
      "aria-hidden": true,
      className:
        "pointer-events-none fixed bottom-2 right-2 z-50 rounded-full bg-dark/90 px-3 py-1 text-[12px] font-medium text-white",
    },
    `Mock API · ${scenario}`,
  )
}

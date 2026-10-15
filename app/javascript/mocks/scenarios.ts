// Scenario switch for the mock API, read ONCE at boot from `?mock=`. The standalone mock host uses it
// (`npm run dev:mock`, e.g. http://127.0.0.1:5173/?mock=coordinator); Vitest sees no query string and
// therefore runs the "default" scenario. Per-test tweaks go through `mockApi` overrides instead.
export type Scenario = "default" | "empty" | "error" | "slow" | "coordinator" | "new"

const ALLOWED: Scenario[] = ["default", "empty", "error", "slow", "coordinator", "new"]

function read(): Scenario {
  if (typeof window === "undefined") return "default"
  const value = new URLSearchParams(window.location.search).get("mock")
  return value && (ALLOWED as string[]).includes(value) ? (value as Scenario) : "default"
}

export const scenario: Scenario = read()

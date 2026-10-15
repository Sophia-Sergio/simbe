// Scenario switch for the mock API, read once at boot from `?mock=`. The standalone mock host and the
// Rails dev server use it (`npm run dev:mock`, e.g. http://127.0.0.1:5173/?mock=coordinator); Vitest sees
// no query string and runs the "default" scenario. Tests switch scenarios with `setScenario` instead.
export type Scenario = "default" | "empty" | "error" | "slow" | "coordinator" | "new" | "loading"

const ALLOWED: Scenario[] = ["default", "empty", "error", "slow", "coordinator", "new", "loading"]

function read(): Scenario {
  if (typeof window === "undefined") return "default"
  const value = new URLSearchParams(window.location.search).get("mock")
  return value && (ALLOWED as string[]).includes(value) ? (value as Scenario) : "default"
}

/** A live binding: importing modules read the current scenario on every call. */
export let scenario: Scenario = read()

/** Switches scenario at runtime (tests/dev); `reset()` usually follows so db re-seeds for it. */
export function setScenario(next: Scenario): void {
  scenario = next
}

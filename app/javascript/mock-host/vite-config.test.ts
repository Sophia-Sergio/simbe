// @vitest-environment node
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { loadConfigFromFile } from "vite"
import { afterEach, expect, it } from "vitest"

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../..")
const original = process.env.VITE_API_MODE

afterEach(() => {
  if (original === undefined) delete process.env.VITE_API_MODE
  else process.env.VITE_API_MODE = original
})

async function mocksFlag(command: "serve" | "build", mode: string, apiMode: string | undefined) {
  if (apiMode === undefined) delete process.env.VITE_API_MODE
  else process.env.VITE_API_MODE = apiMode
  const loaded = await loadConfigFromFile({ command, mode }, resolve(repo, "vite.config.ts"))
  return loaded?.config.define?.__MOCKS_ENABLED__
}

// The mock API (MSW) may only ever exist in the dev server. Any `vite build`, whatever its mode name (production, staging, test, ...),
// must eliminate it, even when VITE_API_MODE=mock leaks into the environment.
it.each([
  ["serve", "development", "mock", "true"],
  ["serve", "development", "real", "false"],
  ["serve", "development", undefined, "false"],
  ["build", "production", "mock", "false"],
  ["build", "staging", "mock", "false"],
  ["build", "test", "mock", "false"],
  ["build", "development", "mock", "false"],
] as const)("%s in mode %s with VITE_API_MODE=%s sets __MOCKS_ENABLED__ to %s", async (command, mode, apiMode, expected) => {
  expect(await mocksFlag(command, mode, apiMode)).toBe(expected)
})

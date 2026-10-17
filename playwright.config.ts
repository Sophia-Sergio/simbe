import { defineConfig, devices } from "@playwright/test"

// E2E_API=real runs against a running Rails stack (E2E_BASE_URL, see `make ports`); otherwise the mock host (no Docker, no Rails).
const real = process.env.E2E_API === "real"
const desktop = { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } }
const mobile = { ...devices["Pixel 5"], viewport: { width: 390, height: 844 } }
const mockURL = "http://127.0.0.1:5173"

export default defineConfig({
  testDir: "e2e",
  outputDir: "e2e/test-results",
  reporter: [["list"]],
  // CI runners are slower than a laptop and the first requests wait on the Vite dev server compiling: allow a retry and a longer
  // expect timeout there, and keep the worker count low so the dev server is not starved. Local runs stay strict.
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  expect: { timeout: process.env.CI ? 10_000 : 5_000 },
  use: { trace: "retain-on-failure" },
  webServer: real ? undefined : { command: "npm run dev:mock", url: mockURL, reuseExistingServer: true },
  projects: real
    ? [
        { name: "real-desktop", use: { ...desktop, baseURL: process.env.E2E_BASE_URL } },
        { name: "real-mobile", use: { ...mobile, baseURL: process.env.E2E_BASE_URL } },
      ]
    : [
        { name: "mock-desktop", use: { ...desktop, baseURL: mockURL } },
        { name: "mock-mobile", use: { ...mobile, baseURL: mockURL } },
      ],
})

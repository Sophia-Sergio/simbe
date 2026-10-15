import { ApiError } from "@/api/client"
import { createQueryClient } from "./Providers"

// Vitest runs with MODE=test (no retries); the app policy is checked by stubbing the mode.
it("the app retries a flaky request once but never a 401 or 403", () => {
  vi.stubEnv("MODE", "production")
  const retry = createQueryClient().getDefaultOptions().queries!.retry as (count: number, error: unknown) => boolean
  vi.unstubAllEnvs()
  expect(retry(0, new Error("network"))).toBe(true)
  expect(retry(1, new Error("network"))).toBe(false)
  expect(retry(0, new ApiError(401, "unauthenticated", "x"))).toBe(false)
  expect(retry(0, new ApiError(403, "forbidden", "x"))).toBe(false)
  expect(retry(0, new ApiError(500, "boom", "x"))).toBe(true)
})

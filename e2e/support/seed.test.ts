import { assertLocalStack } from "./seed"

// Unit test for the guard that keeps the real-stack journeys from seeding a remote environment
// (docs/conventions/worktrees.md: a lane only ever touches its own stack).

it("allows no base URL, localhost, 127.0.0.1 and [::1]", () => {
  for (const url of [undefined, "http://localhost:3000", "http://127.0.0.1:63500", "http://[::1]:3000"]) {
    expect(() => assertLocalStack(url, undefined)).not.toThrow()
  }
})

it("refuses a remote host", () => {
  expect(() => assertLocalStack("https://staging.simbe.app", undefined)).toThrow(/non-local E2E_BASE_URL/)
})

it("allows a remote host with E2E_ALLOW_REMOTE=1", () => {
  expect(() => assertLocalStack("https://staging.simbe.app", "1")).not.toThrow()
})

it("refuses a base URL that is not a URL", () => {
  expect(() => assertLocalStack("not a url", undefined)).toThrow(/not a valid URL/)
})

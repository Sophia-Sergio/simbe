import { loadedLabel } from "./lib"

it("formats the loaded timestamp in the agency's time zone", () => {
  expect(loadedLabel("2026-10-01T16:14:30.000Z", "America/Los_Angeles")).toBe("Oct 1, 2026 · 9:14 am")
  expect(loadedLabel("2026-10-01T16:14:30.000Z", "America/Chicago")).toBe("Oct 1, 2026 · 11:14 am")
})

it("falls back to UTC for an unknown zone and returns null for missing or invalid dates", () => {
  expect(loadedLabel("2026-10-01T16:14:30.000Z", "Mars/Base")).toBe("Oct 1, 2026 · 4:14 pm")
  expect(loadedLabel(null, "UTC")).toBeNull()
  expect(loadedLabel("not a date", "UTC")).toBeNull()
})

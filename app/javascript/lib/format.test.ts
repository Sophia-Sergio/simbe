import { formatDate, formatDelta, formatDuration, formatInt, formatMoney, formatPct } from "./format"

describe("formatMoney", () => {
  it("rounds to whole dollars at $100 and shows cents below", () => {
    expect(formatMoney(28333)).toBe("$283")
    expect(formatMoney(4550)).toBe("$45.50")
    expect(formatMoney(0)).toBe("$0.00")
  })
  it("renders an em dash for missing values", () => {
    expect(formatMoney(null)).toBe("—")
    expect(formatMoney(undefined)).toBe("—")
  })
})

describe("formatInt / formatPct", () => {
  it("groups thousands", () => {
    expect(formatInt(3530)).toBe("3,530")
    expect(formatInt(null)).toBe("—")
  })
  it("formats percentages to one decimal by default", () => {
    expect(formatPct(14.14)).toBe("14.1%")
    expect(formatPct(14.14, 0)).toBe("14%")
    expect(formatPct(null)).toBe("—")
  })
})

describe("formatDelta", () => {
  it("signs, tones and suffixes a delta", () => {
    expect(formatDelta(6)).toEqual({ text: "+6%", tone: "up" })
    expect(formatDelta(-0.3, "pp")).toEqual({ text: "−0.3", tone: "down" })
    expect(formatDelta(null)).toEqual({ text: "", tone: "none" })
    expect(formatDelta(0)).toEqual({ text: "0%", tone: "none" })
  })
})

describe("formatDuration", () => {
  it("rounds minutes, then hours, then days", () => {
    expect(formatDuration(22.5)).toBe("23m")
    expect(formatDuration(130)).toBe("2h 10m")
    expect(formatDuration(120)).toBe("2h")
    expect(formatDuration(4400)).toBe("3d")
    expect(formatDuration(null)).toBe("—")
  })
})

describe("formatDate", () => {
  it("renders short, long and time styles in the agency zone", () => {
    expect(formatDate("2026-10-01T12:00:00Z", "America/Los_Angeles", "short")).toBe("Oct 1")
    expect(formatDate("2026-10-01T12:00:00Z", "America/Los_Angeles", "long")).toBe("Thursday Oct 1")
    expect(formatDate("2026-10-01T16:14:00Z", "America/Los_Angeles", "time")).toBe("9:14 am")
  })
  it("renders an em dash for missing or invalid values", () => {
    expect(formatDate(null, "America/Los_Angeles")).toBe("—")
    expect(formatDate("not-a-date", "America/Los_Angeles")).toBe("—")
  })
})

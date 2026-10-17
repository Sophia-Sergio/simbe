import { barPct } from "./lib"

it("clamps a bar percentage to 0..100 and guards non-finite input", () => {
  expect(barPct(42)).toBe(42)
  expect(barPct(100)).toBe(100)
  expect(barPct(140)).toBe(100)
  expect(barPct(-10)).toBe(0)
  expect(barPct(Number.NaN)).toBe(0)
  expect(barPct(Number.POSITIVE_INFINITY)).toBe(0)
  expect(barPct(null)).toBe(0)
  expect(barPct(undefined)).toBe(0)
})

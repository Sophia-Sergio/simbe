import { expect } from "@playwright/test"
import type { Page, TestInfo } from "@playwright/test"

// Viewport helpers for the W3-2 journeys. The app switches shells at 860px
// (docs/conventions/frontend.md); the real Playwright projects are `real-desktop` (1280×800)
// and `real-mobile` (390×844), so the project name is the reliable signal.

/** True on the desktop shell (>= 860px). */
export function isDesktop(page: Page): boolean {
  return (page.viewportSize()?.width ?? 0) >= 860
}

/** `desktop` | `mobile`, from the Playwright project name (`real-desktop` / `real-mobile`). */
export function viewportName(testInfo: TestInfo): "desktop" | "mobile" {
  return testInfo.project.name.includes("mobile") ? "mobile" : "desktop"
}

/** A journey step's screenshot path: `e2e/screenshots/journeys/<name>-<viewport>.png`. */
export function shot(name: string, testInfo: TestInfo): string {
  return `e2e/screenshots/journeys/${name}-${viewportName(testInfo)}.png`
}

/** The journey acceptance on every data screen: never wider than the viewport. */
export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow, "the page must not scroll horizontally").toBeLessThanOrEqual(1)
}

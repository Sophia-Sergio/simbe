import { expect } from "@playwright/test"
import type { Locator, Page } from "@playwright/test"
import { isDesktop } from "./viewport"

// Navigation by role: the desktop sidebar and the mobile tab bar / More sheet expose the same
// screens under different names (docs/superpowers/parallel/README.md, "Nav order table"). A journey
// asks for the desktop label and this picks the right mobile control.

/** The desktop sidebar labels (mobile lives in the table below). */
export type Destination =
  | "This week"
  | "Funnel"
  | "Channels"
  | "Pipeline"
  | "Coordinators"
  | "Data sources"
  | "Connect Claude"
  | "Settings"
  | "Next actions"
  | "My leads"
  | "Ask"

const MOBILE: Record<Destination, { tab?: string; more?: string }> = {
  "This week": { tab: "Home" },
  Funnel: { more: "Funnel" },
  Channels: { tab: "Channels" },
  Pipeline: { tab: "Pipeline" },
  Coordinators: { more: "Coordinators" },
  "Data sources": { more: "Data sources" },
  "Connect Claude": { more: "Connect Claude" },
  Settings: { more: "Settings" },
  "Next actions": { tab: "Next actions" },
  "My leads": { tab: "My leads" },
  Ask: { tab: "Ask" },
}

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
/** A nav item's accessible name can carry a count badge (e.g. "Pipeline 4"), so match the prefix. */
const label = (value: string) => new RegExp(`^${escape(value)}(\\s|$)`)

/** Navigates the way a user would, asserting by role rather than by CSS selector. */
export async function navTo(page: Page, destination: Destination): Promise<void> {
  const target = MOBILE[destination]
  if (isDesktop(page)) {
    await page.getByTestId("sidebar").getByRole("link", { name: label(destination) }).click()
  } else if (target.tab === "Ask") {
    await page.getByRole("button", { name: "Ask", exact: true }).click()
  } else if (target.tab) {
    await page.getByRole("navigation", { name: "Tabs" }).getByRole("link", { name: label(target.tab) }).click()
  } else {
    await page.getByRole("button", { name: "More", exact: true }).click()
    await page.getByRole("dialog", { name: "More" }).getByRole("link", { name: label(target.more ?? destination) }).click()
  }
  await expect(page.locator("[data-shell]")).toBeVisible()
}

/** Opens "Ask Simbe" the way the user does — the FAB on desktop, the Ask tab on mobile. */
export async function openAgent(page: Page): Promise<Locator> {
  if (isDesktop(page)) await page.getByRole("button", { name: "Ask Simbe" }).click()
  else await page.getByRole("button", { name: "Ask", exact: true }).click()
  const panel = page.getByRole("dialog", { name: "Ask Simbe" })
  await expect(panel).toBeVisible()
  return panel
}

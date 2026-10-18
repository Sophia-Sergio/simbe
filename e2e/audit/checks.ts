import { AxeBuilder } from "@axe-core/playwright"
import type { Page } from "@playwright/test"

// The per-(screen, width) invariants from plan 2162 task 1. Each returns a list of violations; the
// spec turns a non-empty list into a soft assertion so one failing cell never hides the rest.

export type Violation = { rule: string; detail: string }

const IGNORED_BY_SIZE = "data-audit-ignore-size"

/** `documentElement.scrollWidth` never exceeds the viewport (1px tolerance for sub-pixel rounding). */
export const documentOverflow = (page: Page): Promise<Violation[]> =>
  page.evaluate(() => {
    const overflow = document.documentElement.scrollWidth - window.innerWidth
    if (overflow <= 1) return []
    // Name the widest culprits (absolute/fixed/scrolling elements included): the element-level check
    // deliberately ignores positioned and scrolling boxes, so the document check has to point at them.
    const offenders: string[] = []
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      const rect = el.getBoundingClientRect()
      if (rect.width <= 0 || rect.right <= window.innerWidth + 1) continue
      const name = typeof el.className === "string" ? el.className.slice(0, 60) : ""
      offenders.push(`<${el.tagName.toLowerCase()} class="${name}"> right=${Math.round(rect.right)}`)
    }
    return [{ rule: "horizontal-scroll", detail: `the document is ${overflow}px wider than the viewport${offenders.length ? `: ${offenders.slice(0, 4).join(" ; ")}` : ""}` }]
  })

/**
 * No element pushes a laid-out child past its own box. Absolute/fixed children (badges, popovers) are
 * positioned by design and are skipped; `hidden`/`auto`/`scroll` clips or scrolls instead of overflowing.
 */
export const elementOverflow = (page: Page): Promise<Violation[]> =>
  page.evaluate((ignored) => {
    const violations: { rule: string; detail: string }[] = []
    const classes = (el: Element) => (typeof el.className === "string" ? el.className.slice(0, 50) : "")
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(`body *:not([${ignored}])`))) {
      if (el.clientWidth <= 0) continue
      const style = getComputedStyle(el)
      if (style.overflowX !== "visible") continue
      const box = el.getBoundingClientRect()
      const left = box.left + el.clientLeft
      const right = left + el.clientWidth
      for (const child of Array.from(el.children)) {
        const childStyle = getComputedStyle(child)
        if (childStyle.position === "absolute" || childStyle.position === "fixed") continue
        if (childStyle.display === "none" || childStyle.display === "contents") continue
        const rect = child.getBoundingClientRect()
        if (rect.width <= 0) continue
        const overflow = Math.max(rect.right - right, left - rect.left)
        if (overflow <= 1) continue
        violations.push({
          rule: "element-overflow",
          detail: `<${child.tagName.toLowerCase()} class="${classes(child)}"> overflows <${el.tagName.toLowerCase()} class="${classes(el)}"> by ${Math.round(overflow)}px`,
        })
        break
      }
    }
    return violations.slice(0, 6)
  }, IGNORED_BY_SIZE)

/**
 * Interactive targets are at least 44×44px on phone widths, or spaced so a 44px circle centred on them
 * touches no other target — the WCAG 2.5.5 size-or-spacing alternative. (Without the spacing form the
 * rule would fail every 36px button and 40px input in the shipped design system; with it, only genuinely
 * cramped controls fail.)
 */
export const tapTargets = (page: Page): Promise<Violation[]> =>
  page.evaluate((ignored) => {
    const SELECTOR = `a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="tab"], [role="option"], [role="menuitem"], [role="switch"], [role="checkbox"], [role="radio"]`
    const nameOf = (el: Element) =>
      (el.getAttribute("aria-label") || el.textContent || el.getAttribute("placeholder") || "").replace(/\s+/g, " ").trim().slice(0, 40)
    const candidates = Array.from(document.querySelectorAll<HTMLElement>(`${SELECTOR}:not([${ignored}])`))
    const targets = candidates
      .filter((el) => {
        const rect = el.getBoundingClientRect()
        if (rect.width <= 1 || rect.height <= 1) return false // not rendered (sr-only inputs, hidden panels)
        if (el.closest('[aria-hidden="true"]')) return false
        if ((el as HTMLInputElement).disabled) return false
        const style = getComputedStyle(el)
        if (style.visibility === "hidden" || style.display === "none") return false
        // WCAG 2.5.5/2.5.8 inline exception: a link that flows inside a sentence is not a standalone target.
        if (el.tagName === "A" && style.display === "inline") return false
        return true
      })
      .map((el) => {
        // Fixed/sticky chrome (the tab bar, a sticky header) paints over the scrolling content it covers;
        // a control that scrolls beneath it is occluded, not an adjacent tap target.
        let chrome = false
        for (let node: Element | null = el; node; node = node.parentElement) {
          if (/^(fixed|sticky)$/.test(getComputedStyle(node).position)) {
            chrome = true
            break
          }
        }
        return { el, rect: el.getBoundingClientRect(), chrome }
      })

    const violations: { rule: string; detail: string }[] = []
    for (const { el, rect } of targets) {
      if (rect.width >= 44 && rect.height >= 44) continue
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      const radius = 22
      let collision: (typeof targets)[number] | null = null
      for (const other of targets) {
        if (other.el === el) continue
        // Fixed/sticky chrome (the tab bar, a sticky header) paints over the scrolling content it covers;
        // a control that scrolls beneath it is occluded, not an adjacent tap target.
        if (other.chrome) continue
        const nearestX = Math.max(other.rect.left, Math.min(cx, other.rect.right))
        const nearestY = Math.max(other.rect.top, Math.min(cy, other.rect.bottom))
        if ((cx - nearestX) ** 2 + (cy - nearestY) ** 2 < radius * radius) {
          collision = other
          break
        }
      }
      if (collision) {
        violations.push({
          rule: "tap-target",
          detail: `<${el.tagName.toLowerCase()}> "${nameOf(el)}" is ${Math.round(rect.width)}×${Math.round(rect.height)}px and within 44px of <${collision.el.tagName.toLowerCase()}> "${nameOf(collision.el)}"`,
        })
      }
    }
    return violations.slice(0, 10)
  }, IGNORED_BY_SIZE)

/**
 * axe has no `serious` or `critical` violations (WCAG AA tags), minus one documented allowance:
 * `docs/design/brand.md` keeps white 14px/600 text on the `brand` fill (~3.6:1) for primary buttons and
 * links ("buttons use 14px/600 text"). Those nodes are recorded as an intentional deviation, and any
 * other contrast pair still fails.
 */
export async function axeViolations(page: Page): Promise<Violation[]> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .options({ resultTypes: ["violations"] })
    .analyze()
  const violations: Violation[] = []
  for (const violation of results.violations) {
    if (violation.impact !== "serious" && violation.impact !== "critical") continue
    if (violation.id === "color-contrast") {
      const remaining: typeof violation.nodes = []
      for (const node of violation.nodes) {
        const target = node.target?.length === 1 && typeof node.target[0] === "string" ? node.target[0] : null
        if (!target) {
          remaining.push(node)
          continue
        }
        // axe can flag a node whose sampled background is obscured by an overlapping panel; recompute the
        // WCAG ratio from the node's own computed colours and drop the node only when it genuinely passes.
        if (await isAllowedBrandText(page, target)) continue
        if (await contrastPasses(page, target)) continue
        remaining.push(node)
      }
      if (!remaining.length) continue
      const sample = remaining[0].target?.join(" ") ?? ""
      const selector = remaining[0].target?.length === 1 && typeof remaining[0].target[0] === "string" ? remaining[0].target[0] : null
      const colors = selector ? await contrastDetail(page, selector) : ""
      violations.push({
        rule: `axe:${violation.id}`,
        detail: `${violation.help} — ${remaining.length} node(s), e.g. ${sample}${colors ? ` (${colors})` : ""}`,
      })
      continue
    }
    violations.push({
      rule: `axe:${violation.id}`,
      detail: `${violation.help} — ${violation.nodes.length} node(s), e.g. ${violation.nodes[0]?.target?.join(" ")}`,
    })
  }
  return violations
}

/** White 14px/600 text on the brand fill — the pair `docs/design/brand.md` documents as intentional. */
const isAllowedBrandText = (page: Page, selector: string): Promise<boolean> =>
  page.evaluate((target) => {
    const element = document.querySelector(target)
    if (!element) return false
    const style = getComputedStyle(element)
    if (parseFloat(style.fontSize) < 14) return false
    if ((Number(style.fontWeight) || 400) < 600) return false
    if (!/^rgba?\(255,\s*255,\s*255(,\s*1)?\)$/.test(style.color)) return false
    for (let node: Element | null = element; node; node = node.parentElement) {
      const background = getComputedStyle(node).backgroundColor
      if (background && background !== "rgba(0, 0, 0, 0)" && background !== "transparent") {
        return /^rgba?\(255,\s*27,\s*90(,\s*1)?\)$/.test(background)
      }
    }
    return false
  }, selector)

/** The WCAG contrast ratio of the node's own computed colours, using the effective (composited) background. */
const contrastPasses = (page: Page, selector: string): Promise<boolean> =>
  page.evaluate((target) => {
    const element = document.querySelector(target)
    if (!element) return false
    const parse = (value: string) => {
      const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/)
      if (!match) return null
      return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]), a: match[4] === undefined ? 1 : Number(match[4]) }
    }
    const luminance = ({ r, g, b }: { r: number; g: number; b: number }) => {
      const channel = (value: number) => {
        const scaled = value / 255
        return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
    }
    const style = getComputedStyle(element)
    const foreground = parse(style.color)
    if (!foreground) return false
    const layers: { r: number; g: number; b: number; a: number }[] = []
    for (let node: Element | null = element; node; node = node.parentElement) {
      const layer = parse(getComputedStyle(node).backgroundColor)
      if (!layer || layer.a === 0) continue
      layers.push(layer)
      if (layer.a >= 1) break
    }
    let background = { r: 255, g: 255, b: 255 }
    for (const layer of layers.reverse()) {
      background = {
        r: layer.r * layer.a + background.r * (1 - layer.a),
        g: layer.g * layer.a + background.g * (1 - layer.a),
        b: layer.b * layer.a + background.b * (1 - layer.a),
      }
    }
    const light = Math.max(luminance(foreground), luminance(background))
    const dark = Math.min(luminance(foreground), luminance(background))
    const ratio = (light + 0.05) / (dark + 0.05)
    const size = parseFloat(style.fontSize)
    const weight = Number(style.fontWeight) || 400
    const large = size >= 24 || (size >= 18.66 && weight >= 700)
    return ratio >= (large ? 3 : 4.5)
  }, selector)

/** The computed foreground/background and type a failing contrast node actually renders with. */
const contrastDetail = (page: Page, selector: string): Promise<string> =>
  page.evaluate((target) => {
    const element = document.querySelector(target)
    if (!element) return ""
    const style = getComputedStyle(element)
    let background = "transparent"
    for (let node: Element | null = element; node; node = node.parentElement) {
      const value = getComputedStyle(node).backgroundColor
      if (value && value !== "rgba(0, 0, 0, 0)" && value !== "transparent") {
        background = value
        break
      }
    }
    return `color ${style.color} on ${background}, ${style.fontSize} ${style.fontWeight}`
  }, selector)

const MAX_TABS = 60

/** Tab order reaches the primary action (the first control inside the main region or the open dialog). */
export async function focusOrder(page: Page): Promise<Violation[]> {
  const primary = await page.evaluate(() => {
    // An open dialog wins over `main`: the portal is appended last, so `main` would otherwise match first
    // and the check would look for a control behind the modal that the focus trap rightly never reaches.
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')
    const scope = dialog ?? document.querySelector<HTMLElement>("main") ?? document.body
    const candidate = Array.from(
      scope.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'),
    ).find((el) => {
      const rect = el.getBoundingClientRect()
      // Visible only: an `sr-only` radio (1×1px, clipped) is not a screen's primary action.
      return rect.width > 2 && rect.height > 2 && !(el as HTMLInputElement).disabled
    })
    if (!candidate) return null
    candidate.setAttribute("data-audit-primary", "1")
    return `${candidate.tagName.toLowerCase()}${candidate.getAttribute("aria-label") ? `[${candidate.getAttribute("aria-label")}]` : ""}`
  })
  if (!primary) return []
  // Start from the top of the document: focus left over from an earlier width would skip the first stops.
  // Inside an open dialog the trap already holds focus; blurring would fight it, so start from where it is.
  await page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null
    if (!active?.closest('[role="dialog"]')) active?.blur()
  })
  const seen: string[] = []
  for (let i = 0; i < MAX_TABS; i++) {
    await page.keyboard.press("Tab")
    const state = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null
      if (!element) return { hit: false, label: "none" }
      const label = `${element.tagName.toLowerCase()}${element.getAttribute("aria-label") ? `[${element.getAttribute("aria-label")}]` : ""}`
      return { hit: element.hasAttribute("data-audit-primary"), label }
    })
    if (state.hit) return []
    seen.push(state.label)
  }
  return [{ rule: "focus-order", detail: `primary ${primary} not reached in ${MAX_TABS} Tabs; focus went ${seen.slice(0, 10).join(" → ")}` }]
}

/** A transform/opacity transition or a keyframe animation carries a `motion-reduce:` opt-out. */
export const reducedMotion = async (page: Page): Promise<Violation[]> => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  const violations = await page.evaluate((ignored) => {
    const zero = (value: string) => /^0s?(,|$)/.test(value.trim())
    const out: { rule: string; detail: string }[] = []
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(`body *:not([${ignored}])`))) {
      if (el.clientWidth <= 0) continue
      const name = typeof el.className === "string" ? el.className : ""
      if (name.includes("motion-reduce:")) continue // the component declares its reduced-motion opt-out
      const style = getComputedStyle(el)
      const animates = style.animationName !== "none" && !zero(style.animationDuration)
      const moves = /(transform|all)/.test(style.transitionProperty) && !zero(style.transitionDuration)
      if (animates || moves) {
        out.push({
          rule: "reduced-motion",
          detail: `<${el.tagName.toLowerCase()} class="${name.slice(0, 60)}"> ${animates ? `animates (${style.animationName})` : `transitions ${style.transitionProperty}`}`,
        })
      }
    }
    return out.slice(0, 6)
  }, IGNORED_BY_SIZE)
  await page.emulateMedia({ reducedMotion: null })
  return violations
}

/** Body copy is Inter and display type is Outfit (docs/design/brand.md). */
export const fonts = (page: Page): Promise<Violation[]> =>
  page.evaluate(() => {
    const out: { rule: string; detail: string }[] = []
    const body = getComputedStyle(document.body).fontFamily
    if (!/^"?Inter\b/.test(body)) out.push({ rule: "font-body", detail: `body font-family is "${body}"` })
    const display = document.querySelector<HTMLElement>('[class*="font-display"]')
    if (display) {
      const family = getComputedStyle(display).fontFamily
      if (!/^"?Outfit\b/.test(family)) out.push({ rule: "font-display", detail: `display font-family is "${family}"` })
    }
    return out
  })

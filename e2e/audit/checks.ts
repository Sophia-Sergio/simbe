import { AxeBuilder } from "@axe-core/playwright"
import type { Page } from "@playwright/test"

// The per-(screen, width) invariants from plan 2162 task 1, tightened after the W3-3 review:
// K1 — the plan's own rule (>= 44x44px below 860) is the tap-target check; no spacing escape, no chrome
//      exclusion. Anything not fixed in the app is listed as a named known issue in audit-report.md.
// K2 — no home-made contrast bypass: the only allowance is the brand.md:54 white 14px/600 on the brand
//      fill, matched only on real brand buttons (the actual Button primary classes).

export type Violation = {
  rule: string
  detail: string
  /** a compact CSS selector for the offending element (known-issues table) */
  selector?: string
  /** width×height for tap-target findings */
  size?: string
}

const IGNORED_BY_SIZE = "data-audit-ignore-size"

/** `documentElement.scrollWidth` never exceeds the viewport (1px tolerance for sub-pixel rounding). */
export const documentOverflow = (page: Page): Promise<Violation[]> =>
  page.evaluate(() => {
    const overflow = document.documentElement.scrollWidth - window.innerWidth
    if (overflow <= 1) return []
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
 * K1: every interactive target is at least 44x44 CSS px below 860. This is the plan's rule as written —
 * no WCAG 2.5.5 spacing alternative and no exclusion for fixed/sticky chrome. Findings that cannot be
 * fixed here are reported verbatim in the report's known-issues table.
 *
 * A visually hidden control (`sr-only` radio, clipped input) is measured on the label that receives the
 * click, so an sr-only radio is still checked through its card. Skips are documented in the report's
 * allowances: WCAG 2.5.5's inline-link exception, disabled controls, `aria-hidden` subtrees, and a
 * visually hidden control with no label at all (the dropzone's file input is measured on its
 * `role="button"` surface instead).
 */
export const tapTargets = (page: Page): Promise<Violation[]> =>
  page.evaluate((ignored) => {
    const SELECTOR = `a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="tab"], [role="option"], [role="menuitem"], [role="switch"], [role="checkbox"], [role="radio"]`
    const nameOf = (el: Element) =>
      (el.getAttribute("aria-label") || el.textContent || el.getAttribute("placeholder") || "").replace(/\s+/g, " ").trim().slice(0, 40)
    const compact = (el: Element) => {
      const classes = typeof el.className === "string" ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 3) : []
      const aria = el.getAttribute("aria-label")
      const tag = el.tagName.toLowerCase()
      const type = el.getAttribute("type")
      const suffix = aria ? `[aria-label="${aria.replace(/"/g, "'")}"]` : type ? `[type="${type}"]` : ""
      return `${tag}${classes.map((name) => `.${name}`).join("")}${suffix}`
    }
    /** The box the user actually taps: the control itself, or the label of a visually hidden control. */
    const tapBox = (el: HTMLElement): { rect: DOMRect; on: string } | null => {
      const rect = el.getBoundingClientRect()
      if (rect.width > 1 && rect.height > 1) return { rect, on: "" }
      const label = (el as HTMLInputElement).labels?.[0] ?? el.closest("label")
      if (label) {
        const labelRect = label.getBoundingClientRect()
        if (labelRect.width > 1 && labelRect.height > 1) return { rect: labelRect, on: " (measured on its <label>)" }
      }
      return null
    }
    const violations: { rule: string; detail: string; selector: string; size: string }[] = []
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(`${SELECTOR}:not([${ignored}])`))) {
      if (el.closest('[aria-hidden="true"]')) continue
      if ((el as HTMLInputElement).disabled) continue
      const style = getComputedStyle(el)
      if (style.visibility === "hidden" || style.display === "none") continue
      // WCAG 2.5.5 inline exception: a link that flows inside a sentence is not a standalone target.
      if (el.tagName === "A" && style.display === "inline") continue
      const box = tapBox(el)
      if (!box) continue // visually hidden and has no label: reported as a skip in the report's allowances
      if (box.rect.width >= 44 && box.rect.height >= 44) continue
      const size = `${Math.round(box.rect.width)}x${Math.round(box.rect.height)}`
      violations.push({
        rule: "tap-target",
        detail: `<${el.tagName.toLowerCase()}> "${nameOf(el)}" is ${size}px${box.on}`,
        selector: compact(el),
        size,
      })
    }
    return violations.slice(0, 60)
  }, IGNORED_BY_SIZE)

/**
 * axe has no `serious` or `critical` violations (WCAG AA tags). The one documented allowance is
 * `docs/design/brand.md` line 54: white 14px/600 text on the `brand` fill. K2 limits it to real brand
 * buttons, matched by the actual primary Button classes — not to any small text on a pink background.
 */
export async function axeViolations(page: Page): Promise<Violation[]> {
  // The kit's `useLockBody` marks `#root` inert/aria-hidden while a dialog is open, but axe still samples
  // that background (dimmed content behind the translucent scrim). While a dialog is open the audit hides
  // `#root` from the measurement and scans the dialog only — the reachable part. Non-modal screens are
  // scanned in full. Screenshots are taken after this restores the root.
  const hasDialog = await page.evaluate(() => !!document.querySelector('[role="dialog"]'))
  if (hasDialog) {
    await page.evaluate(() => {
      const root = document.getElementById("root")
      if (!root) return
      root.dataset.auditVisibility = root.style.visibility
      root.style.visibility = "hidden"
    })
  }
  try {
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .options({ resultTypes: ["violations"] })
      .analyze()
    return collectAxeViolations(page, results)
  } finally {
    if (hasDialog) {
      await page.evaluate(() => {
        const root = document.getElementById("root")
        if (!root) return
        root.style.visibility = root.dataset.auditVisibility ?? ""
        delete root.dataset.auditVisibility
      })
    }
  }
}

async function collectAxeViolations(page: Page, results: Awaited<ReturnType<AxeBuilder["analyze"]>>): Promise<Violation[]> {
  const violations: Violation[] = []
  for (const violation of results.violations) {
    if (violation.impact !== "serious" && violation.impact !== "critical") continue
    if (violation.id === "color-contrast") {
      const remaining: typeof violation.nodes = []
      for (const node of violation.nodes) {
        const target = node.target?.length === 1 && typeof node.target[0] === "string" ? node.target[0] : null
        if (!target || !(await isAllowedBrandButtonText(page, target))) remaining.push(node)
      }
      if (!remaining.length) continue
      const sample = remaining[0].target?.join(" ") ?? ""
      const selector = remaining[0].target?.length === 1 && typeof remaining[0].target[0] === "string" ? remaining[0].target[0] : undefined
      const colors = selector ? await contrastDetail(page, selector) : ""
      const reason = (remaining[0].failureSummary ?? "").replace(/\s+/g, " ").trim().slice(0, 180)
      violations.push({
        rule: `axe:${violation.id}`,
        detail: `${violation.help} — ${remaining.length} node(s), e.g. ${sample}${colors ? ` (${colors})` : ""}${reason ? ` [${reason}]` : ""}`,
        selector,
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

/**
 * The brand.md:54 pair: white 14px/600 text whose interactive host is a real primary Button
 * (`<button|a>` with `bg-brand text-white rounded-full text-[14px] font-semibold`).
 */
const isAllowedBrandButtonText = (page: Page, selector: string): Promise<boolean> =>
  page.evaluate((target) => {    const node = document.querySelector(target)
    if (!node) return false
    const style = getComputedStyle(node)
    if (Math.round(parseFloat(style.fontSize)) !== 14) return false
    if ((Number(style.fontWeight) || 400) < 600) return false
    if (!/^rgba?\(255,\s*255,\s*255(,\s*1)?\)$/.test(style.color)) return false
    for (let host: Element | null = node; host; host = host.parentElement) {
      if (host.tagName !== "BUTTON" && host.tagName !== "A") continue
      const classes = host.classList
      const isBrandButton =
        classes.contains("bg-brand") &&
        classes.contains("text-white") &&
        classes.contains("rounded-full") &&
        classes.contains("text-[14px]") &&
        classes.contains("font-semibold")
      if (!isBrandButton) continue
      const background = getComputedStyle(host).backgroundColor
      return /^rgba?\(255,\s*27,\s*90(,\s*1)?\)$/.test(background)
    }
    return false
  }, selector)

const MAX_TABS = 60

/**
 * Every control inside a `role="group"`/`role="tablist"` (the kit `Segmented`, `Tabs`, the pipeline chips
 * and view toggles) shows a focus indicator that no clipping ancestor cuts off. The check focuses each
 * control with a real keyboard move (Shift+Tab then Tab, so `:focus-visible` matches) and measures it;
 * the segmented control's `overflow-x-auto` used to clip its 2px outline at every width.
 */
export async function groupedFocusRings(page: Page): Promise<Violation[]> {
  const controls = page.locator('[role="group"] button, [role="tablist"] button')
  const count = await controls.count()
  const violations: Violation[] = []
  for (let index = 0; index < count && violations.length < 6; index++) {
    const control = controls.nth(index)
    if (!(await control.isVisible())) continue
    const name = (await control.getAttribute("aria-label")) ?? ((await control.textContent()) ?? "").trim().slice(0, 24)
    await control.focus()
    // Arrive by keyboard so the app's `:focus-visible` style (not the raw focus state) is measured.
    await page.keyboard.press("Shift+Tab")
    await page.keyboard.press("Tab")
    const result = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null
      if (!element) return { ok: false, why: "could not be focused" }
      const style = getComputedStyle(element)
      const width = parseFloat(style.outlineWidth) || 0
      const offset = parseFloat(style.outlineOffset) || 0
      const visibleOutline = style.outlineStyle !== "none" && width > 0
      const visibleShadow = style.boxShadow !== "none"
      if (!visibleOutline && !visibleShadow) return { ok: false, why: "shows no outline or box-shadow when focused" }
      const outward = visibleOutline ? Math.max(0, width + offset) : 0
      if (outward === 0) return { ok: true } // an inset indicator has nothing to clip
      const rect = element.getBoundingClientRect()
      const left = rect.left - outward
      const right = rect.right + outward
      const top = rect.top - outward
      const bottom = rect.bottom + outward
      for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
        const ancestorStyle = getComputedStyle(ancestor)
        if (ancestorStyle.overflowX === "visible" && ancestorStyle.overflowY === "visible") continue
        const box = ancestor.getBoundingClientRect()
        const clipLeft = box.left + ancestor.clientLeft
        const clipRight = clipLeft + ancestor.clientWidth
        const clipTop = box.top + ancestor.clientTop
        const clipBottom = clipTop + ancestor.clientHeight
        if (left < clipLeft - 0.5 || right > clipRight + 0.5 || top < clipTop - 0.5 || bottom > clipBottom + 0.5) {
          const classes = typeof ancestor.className === "string" ? ancestor.className.split(/\s+/).slice(0, 3).join(".") : ""
          return { ok: false, why: `has its focus ring clipped by <${ancestor.tagName.toLowerCase()} class="${classes}">` }
        }
      }
      return { ok: true }
    })
    if (!result.ok) violations.push({ rule: "focus-ring", detail: `the grouped control "${name}" ${result.why}` })
  }
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  return violations
}

/** The computed foreground/background, type and any translucent ancestor a failing contrast node renders with. */
const contrastDetail = (page: Page, selector: string): Promise<string> =>
  page.evaluate((target) => {
    const element = document.querySelector(target)
    if (!element) return ""
    const style = getComputedStyle(element)
    let background = "transparent"
    let translucent = "none"
    for (let node: Element | null = element; node; node = node.parentElement) {
      const current = getComputedStyle(node)
      const value = current.backgroundColor
      if (background === "transparent" && value && value !== "rgba(0, 0, 0, 0)" && value !== "transparent") {
        background = value
      }
      if (translucent === "none" && current.opacity !== "1") {
        translucent = `${node.tagName.toLowerCase()}.${typeof node.className === "string" ? node.className.split(/\s+/).slice(0, 2).join(".") : ""} opacity ${current.opacity}`
      }
    }
    const inDialog = element.closest('[role="dialog"]') ? "inside the dialog" : "outside the dialog"
    return `color ${style.color} on ${background}, ${style.fontSize} ${style.fontWeight}; ${inDialog}${translucent === "none" ? "" : `, translucent ancestor: ${translucent}`}`
  }, selector)

/**
 * Tab order reaches the primary action (the first visible control in `main`, or in the open dialog) at
 * 390 and 1280, and the focused control shows a visible indicator (`outline` or `box-shadow`) that the
 * nearest clipping ancestor does not cut off.
 */
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
      // Visible only: an `sr-only` radio (1x1px, clipped) is not a screen's primary action.
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
    if (state.hit) {
      return page.evaluate(() => {
        const element = document.activeElement as HTMLElement | null
        if (!element) return [{ rule: "focus-indicator", detail: "the primary action lost focus after Tab" }]
        const style = getComputedStyle(element)
        const outlineWidth = parseFloat(style.outlineWidth) || 0
        const visibleOutline = style.outlineStyle !== "none" && outlineWidth > 0
        const visibleShadow = style.boxShadow !== "none"
        if (!visibleOutline && !visibleShadow) {
          return [{ rule: "focus-indicator", detail: `the focused primary action (${element.tagName.toLowerCase()}) has no outline or box-shadow` }]
        }
        if (!visibleOutline) return [] // an inset ring is inside the element; nothing to clip
        // An outline (plus its offset) must not be cut off by a clipping ancestor. A negative offset
        // (inset ring, e.g. the segmented control) has no outward extent.
        const outward = Math.max(0, outlineWidth + (parseFloat(style.outlineOffset) || 0))
        if (outward === 0) return []
        const rect = element.getBoundingClientRect()
        const left = rect.left - outward
        const right = rect.right + outward
        const top = rect.top - outward
        const bottom = rect.bottom + outward
        for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
          const ancestorStyle = getComputedStyle(ancestor)
          if (ancestorStyle.overflowX === "visible" && ancestorStyle.overflowY === "visible") continue
          const box = ancestor.getBoundingClientRect()
          const clipLeft = box.left + ancestor.clientLeft
          const clipRight = clipLeft + ancestor.clientWidth
          const clipTop = box.top + ancestor.clientTop
          const clipBottom = clipTop + ancestor.clientHeight
          if (left < clipLeft - 0.5 || right > clipRight + 0.5 || top < clipTop - 0.5 || bottom > clipBottom + 0.5) {
            const name = typeof ancestor.className === "string" ? ancestor.className.split(/\s+/).slice(0, 3).join(".") : ""
            return [{ rule: "focus-ring-clipped", detail: `the focus outline of the primary action is clipped by <${ancestor.tagName.toLowerCase()}.${name}>` }]
          }
        }
        return []
      })
    }
    seen.push(state.label)
  }
  return [{ rule: "focus-order", detail: `primary ${primary} not reached in ${MAX_TABS} Tabs; focus went ${seen.slice(0, 10).join(" → ")}` }]
}

/**
 * With `prefers-reduced-motion: reduce`, keyframe animations are off and motion transitions
 * (transform/opacity) have a zero duration. The check reads computed styles only — it does not trust a
 * `motion-reduce:` class. Colour transitions are not motion and are outside this check (listed in the
 * report's allowances).
 */
export const reducedMotion = async (page: Page): Promise<Violation[]> => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  const violations = await page.evaluate((ignored) => {
    const zero = (value: string) => value.split(",").every((part) => /^0(\.0+)?s$/.test(part.trim()))
    const out: { rule: string; detail: string }[] = []
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(`body *:not([${ignored}])`))) {
      if (el.clientWidth <= 0) continue
      const style = getComputedStyle(el)
      const name = typeof el.className === "string" ? el.className : ""
      const animates = style.animationName !== "none" && !zero(style.animationDuration)
      const motion = /(transform|opacity|\ball\b)/.test(style.transitionProperty) && !zero(style.transitionDuration)
      if (animates || motion) {
        out.push({
          rule: "reduced-motion",
          detail: `<${el.tagName.toLowerCase()} class="${name.slice(0, 60)}"> ${animates ? `animation ${style.animationName} (${style.animationDuration})` : `transition ${style.transitionProperty} (${style.transitionDuration})`}`,
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

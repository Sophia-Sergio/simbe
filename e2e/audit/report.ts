import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { Violation } from "./checks"
import { WIDTHS, screens } from "./screens"
import type { ScreenRole } from "./screens"

// The audit specs hand every (suite, screen, width) result here; this module rewrites the generated region
// of docs/superpowers/parallel/audit-report.md and keeps the hand-written prose around it intact.

export type Cell = {
  mode: "mock" | "real"
  project: string
  /** The role group that produced the cell; part of the sidecar name so workers never overwrite each other. */
  role: ScreenRole
  /** "screens" for the screen x width matrix, "responsive" for the 859/860 and safe-area checks. */
  suite: "screens" | "responsive"
  screen: string
  width: number
  issues: Violation[]
}

const dir = join(process.cwd(), "e2e/audit")
const reportPath = join(process.cwd(), "docs/superpowers/parallel/audit-report.md")
const START = "<!-- audit:start -->"
const END = "<!-- audit:end -->"
/** One run id shared by the mock and real runs (e.g. AUDIT_RUN=review), so old sidecars never leak in. */
const RUN = process.env.AUDIT_RUN || "local"

/** Persist this worker's cells, then re-render the report from this run's sidecars. */
export function writeReport(cells: Cell[]): void {
  mkdirSync(dir, { recursive: true })
  const grouped = new Map<string, Cell[]>()
  for (const cell of cells) {
    const key = `${RUN}-${cell.mode}-${cell.project}-${cell.role}-${cell.suite}`
    grouped.set(key, [...(grouped.get(key) ?? []), cell])
  }
  for (const [key, value] of grouped) writeFileSync(join(dir, `.results-${key}.json`), JSON.stringify(value, null, 2))

  const files = readdirSync(dir).filter((name) => name.startsWith(`.results-${RUN}-`) && name.endsWith(".json"))
  const fresh: Cell[] = []
  for (const file of files) {
    try {
      fresh.push(...(JSON.parse(readFileSync(join(dir, file), "utf8")) as Cell[]))
    } catch {
      // A sidecar written by a worker that crashed mid-run is skipped; the next run rewrites it.
    }
  }
  updateReport(fresh)
}

function updateReport(cells: Cell[]): void {
  const current = existsSync(reportPath) ? readFileSync(reportPath, "utf8") : `${START}\n${END}\n`
  const start = current.indexOf(START)
  const end = current.indexOf(END)
  if (start < 0 || end < 0) throw new Error(`${reportPath} is missing its ${START} / ${END} markers`)
  writeFileSync(reportPath, current.slice(0, start + START.length) + "\n" + render(cells) + current.slice(end))
}

/** Ordered screen ids: the inventory order first, then any extra (responsive) rows. */
function orderedScreens(ids: Set<string>): string[] {
  const known = screens.map((screen) => screen.id).filter((id) => ids.has(id))
  const extra = [...ids].filter((id) => !known.includes(id)).sort()
  return [...known, ...extra]
}

function render(cells: Cell[]): string {
  if (!cells.length) return "_No audit cells were recorded._\n"
  const lines: string[] = []

  // K1: every control that does not meet 44x44 below 860 is listed by name, never hidden by the checker.
  const known = new Map<string, { screen: string; width: number; selector: string; size: string }>()
  for (const cell of cells) {
    for (const issue of cell.issues) {
      if (issue.rule !== "tap-target" || !issue.selector) continue
      const key = `${cell.screen}|${cell.width}|${issue.selector}|${issue.size}`
      if (!known.has(key)) known.set(key, { screen: cell.screen, width: cell.width, selector: issue.selector, size: issue.size ?? "" })
    }
  }
  lines.push("### Known issues: tap targets below 44x44 (widths < 860)", "")
  if (known.size === 0) {
    lines.push("None. Every interactive target measured at the audited phone/tablet widths is at least 44x44.", "")
  } else {
    lines.push("| screen | width | selector | size |")
    lines.push("|---|---|---|---|")
    for (const item of [...known.values()].sort((a, b) => a.screen.localeCompare(b.screen) || a.width - b.width || a.selector.localeCompare(b.selector))) {
      lines.push(`| \`${item.screen}\` | ${item.width} | \`${item.selector}\` | ${item.size} |`)
    }
    lines.push("")
  }

  // Any other rule that failed, with the exact detail.
  const other = cells.flatMap((cell) =>
    cell.issues
      .filter((issue) => issue.rule !== "tap-target")
      .map((issue) => `- \`${cell.project}\` · \`${cell.screen}\` @${cell.width}px · **${issue.rule}** — ${issue.detail}`),
  )
  lines.push("### Other findings", "")
  lines.push(...(other.length ? other : ["None."]))
  lines.push("")

  for (const mode of ["mock", "real"] as const) {
    const inMode = cells.filter((cell) => cell.mode === mode)
    if (!inMode.length) continue
    const projects = [...new Set(inMode.map((cell) => cell.project))].sort()
    const ids = new Set(inMode.map((cell) => cell.screen))
    const seen = orderedScreens(ids)
    lines.push(`### ${mode} mode — projects: ${projects.join(", ")}`, "")
    lines.push(`| screen | ${WIDTHS.join(" | ")} |`)
    lines.push(`|---|${WIDTHS.map(() => "---").join("|")}|`)
    for (const screen of seen) {
      const row = WIDTHS.map((width) => {
        const cellsHere = inMode.filter((cell) => cell.screen === screen && cell.width === width)
        if (!cellsHere.length) return "·"
        return cellsHere.some((cell) => cell.issues.length) ? "✗" : "✓"
      })
      lines.push(`| \`${screen}\` | ${row.join(" | ")} |`)
    }
    lines.push("")
    const failing = inMode.filter((cell) => cell.issues.length)
    const skipped = screens.filter((screen) => screen.mockOnly).map((screen) => `\`${screen.id}\``)
    if (mode === "real" && skipped.length) {
      lines.push(`Mock-only screens skipped in real mode: ${skipped.join(", ")}.`, "")
    }
    if (failing.length) {
      lines.push(`**${failing.length} failing cell(s)** — see the known-issues and other-findings tables above.`, "")
    } else {
      lines.push("All cells in this mode are green.", "")
    }
  }
  return lines.join("\n")
}

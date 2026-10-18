import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { Violation } from "./checks"
import { WIDTHS, screens } from "./screens"
import type { ScreenRole } from "./screens"

// The audit spec hands every (screen, width) result here; this module rewrites the generated region of
// docs/superpowers/parallel/audit-report.md and keeps the hand-written prose around it intact.

export type Cell = {
  mode: "mock" | "real"
  project: string
  /** The role group that produced the cell; also names the sidecar so workers never overwrite each other. */
  role: ScreenRole
  screen: string
  width: number
  issues: Violation[]
}

const dir = join(process.cwd(), "e2e/audit")
const reportPath = join(process.cwd(), "docs/superpowers/parallel/audit-report.md")
const START = "<!-- audit:start -->"
const END = "<!-- audit:end -->"
/** A sidecar belongs to the current run only if it is within this window of the newest one. */
const RUN_WINDOW_MS = 10 * 60 * 1000

/** Persist this worker's cells per (mode, project, role), then re-render the report from this run's sidecars. */
export function writeReport(cells: Cell[]): void {
  mkdirSync(dir, { recursive: true })
  const grouped = new Map<string, Cell[]>()
  for (const cell of cells) {
    // Playwright may run each test in its own worker: one sidecar per (mode, project, role) so no worker
    // overwrites another's results before the report is rendered.
    const key = `${cell.mode}-${cell.project}-${cell.role}`
    grouped.set(key, [...(grouped.get(key) ?? []), cell])
  }
  for (const [key, value] of grouped) writeFileSync(join(dir, `.results-${key}.json`), JSON.stringify(value, null, 2))

  // Exact `mode-project-role` names only: an older run's file (or the pre-role naming) must never leak in.
  const files = readdirSync(dir).filter((name) =>
    /^\.results-(mock|real)-(mock|real)-(desktop|mobile)-(public|owner|coordinator)\.json$/.test(name),
  )
  const newest = files.reduce((latest, name) => Math.max(latest, statSync(join(dir, name)).mtimeMs), 0)
  const fresh: Cell[] = []
  for (const file of files) {
    const path = join(dir, file)
    // Only this run's sidecars: a previous run's files (or the pre-role naming) must not leak into the matrix.
    if (newest - statSync(path).mtimeMs > RUN_WINDOW_MS) continue
    try {
      fresh.push(...(JSON.parse(readFileSync(path, "utf8")) as Cell[]))
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

function render(cells: Cell[]): string {
  if (!cells.length) return "_No audit cells were recorded._\n"
  const lines: string[] = []
  for (const mode of ["mock", "real"] as const) {
    const inMode = cells.filter((cell) => cell.mode === mode)
    if (!inMode.length) continue
    const projects = [...new Set(inMode.map((cell) => cell.project))].sort()
    const seen = screens.filter((screen) => inMode.some((cell) => cell.screen === screen.id))
    lines.push(`### ${mode} mode — projects: ${projects.join(", ")}`, "")
    lines.push(`| screen | ${WIDTHS.join(" | ")} |`)
    lines.push(`|---|${WIDTHS.map(() => "---").join("|")}|`)
    for (const screen of seen) {
      const row = WIDTHS.map((width) => {
        const cellsHere = inMode.filter((cell) => cell.screen === screen.id && cell.width === width)
        if (!cellsHere.length) return "·"
        return cellsHere.some((cell) => cell.issues.length) ? "✗" : "✓"
      })
      lines.push(`| \`${screen.id}\` | ${row.join(" | ")} |`)
    }
    lines.push("")
    const failing = inMode.filter((cell) => cell.issues.length)
    if (failing.length) {
      lines.push(`**${failing.length} failing cell(s):**`, "")
      for (const cell of failing) {
        for (const issue of cell.issues) {
          lines.push(`- \`${cell.project}\` · \`${cell.screen}\` @${cell.width}px · **${issue.rule}** — ${issue.detail}`)
        }
      }
    } else {
      lines.push("All cells green.")
    }
    lines.push("")
  }
  return lines.join("\n")
}

// Shared number/date formatting for the kit. Presentational lane: no data access.

/** Cohort window from `as_of`; lives in the URL for the insights screens. */
export type Range = "30d" | "90d" | "12m"

const intFormat = new Intl.NumberFormat("en-US")

const wholeMoney = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

const centMoney = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function missing(value: number | null | undefined): boolean {
  return value === null || value === undefined || Number.isNaN(value)
}

/** Cents → `$283` at ≥ $100, `$45.50` below it, `—` when absent. */
export function formatMoney(cents: number | null | undefined): string {
  if (missing(cents)) return "—"
  const dollars = (cents as number) / 100
  return Math.abs(dollars) >= 100 ? wholeMoney.format(dollars) : centMoney.format(dollars)
}

/** `3530` → `3,530`; `—` when absent. */
export function formatInt(n: number | null | undefined): string {
  if (missing(n)) return "—"
  return intFormat.format(n as number)
}

/** `14.14` → `14.1%` (one decimal by default); `—` when absent. */
export function formatPct(n: number | null | undefined, digits = 1): string {
  if (missing(n)) return "—"
  return `${(n as number).toFixed(digits)}%`
}

export type DeltaTone = "up" | "down" | "none"

/**
 * Signed delta text + tone. Percentage point deltas print without a suffix
 * (the caller writes `pp` in the label); `null` renders empty, `0` stays silent.
 */
export function formatDelta(
  n: number | null | undefined,
  unit: "%" | "pp" = "%",
): { text: string; tone: DeltaTone } {
  if (missing(n)) return { text: "", tone: "none" }
  const value = n as number
  if (value === 0) return { text: unit === "%" ? "0%" : "0", tone: "none" }
  const sign = value > 0 ? "+" : "−"
  const body = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Math.abs(value))
  return { text: `${sign}${body}${unit === "%" ? "%" : ""}`, tone: value > 0 ? "up" : "down" }
}

/** `22.5` → `23m`, `130` → `2h 10m`, `4400` → `3d`; `—` when absent. */
export function formatDuration(minutes: number | null | undefined): string {
  if (missing(minutes)) return "—"
  const m = Math.round(minutes as number)
  if (m < 60) return `${m}m`
  if (m < 1440) {
    const hours = Math.floor(m / 60)
    const rest = m - hours * 60
    return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`
  }
  return `${Math.round(m / 1440)}d`
}

export type DateStyle = "short" | "long" | "time"

const DATE_OPTIONS: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  short: { month: "short", day: "numeric" },
  long: { weekday: "long", month: "short", day: "numeric" },
  time: { hour: "numeric", minute: "2-digit", hour12: true },
}

/** `oct 1`, `Thursday Oct 1` or `9:14 am`, rendered in the agency's time zone. */
export function formatDate(iso: string | null | undefined, tz: string, style: DateStyle = "short"): string {
  if (!iso) return "—"
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "—"
  const formatted = new Intl.DateTimeFormat("en-US", { timeZone: tz, ...DATE_OPTIONS[style] }).format(date)
  if (style === "long") return formatted.replace(",", "")
  if (style === "time") return formatted.toLowerCase()
  return formatted
}

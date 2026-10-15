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

const twoDecimals = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 })

/** Absent, NaN and ±Infinity all render as the placeholder. */
function missing(value: number | null | undefined): boolean {
  return value === null || value === undefined || !Number.isFinite(value)
}

/** Cents → `$283` at ≥ $100, `$45.50` below it, `—` when absent. */
export function formatMoney(cents: number | null | undefined): string {
  if (missing(cents)) return "—"
  const dollars = Math.round(cents as number) / 100
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
  const rounded = Number((n as number).toFixed(digits))
  const normalised = Object.is(rounded, -0) ? 0 : rounded
  return `${normalised.toFixed(digits).replace("-", "−")}%`
}

export type DeltaTone = "up" | "down" | "none"

/**
 * Signed delta text + tone. Percentage point deltas print without a suffix
 * (the caller writes `pp` in the label); `null` renders empty, `0` stays silent.
 * The value is rounded to two decimals *before* the zero test, so `0.004` is
 * neutral rather than `+0%`.
 */
export function formatDelta(
  n: number | null | undefined,
  unit: "%" | "pp" = "%",
): { text: string; tone: DeltaTone } {
  if (missing(n)) return { text: "", tone: "none" }
  const rounded = Math.round((n as number) * 100) / 100
  if (rounded === 0) return { text: unit === "%" ? "0%" : "0", tone: "none" }
  const sign = rounded > 0 ? "+" : "−"
  return { text: `${sign}${twoDecimals.format(Math.abs(rounded))}${unit === "%" ? "%" : ""}`, tone: rounded > 0 ? "up" : "down" }
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

// Intl formatters are expensive to build and formatDate runs per pipeline card
// (~3,500 of them), so cache one per tz+style.
const formatterCache = new Map<string, Intl.DateTimeFormat>()

function safeTimeZone(tz: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz })
    return tz
  } catch {
    return "UTC"
  }
}

function dateFormatter(tz: string, style: DateStyle): Intl.DateTimeFormat {
  const zone = safeTimeZone(tz || "UTC")
  const key = `${zone}|${style}`
  let formatter = formatterCache.get(key)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", { timeZone: zone, ...DATE_OPTIONS[style] })
    formatterCache.set(key, formatter)
  }
  return formatter
}

/** `Oct 1`, `Thursday Oct 1` or `9:14 am`, rendered in the agency's time zone. */
export function formatDate(iso: string | null | undefined, tz: string, style: DateStyle = "short"): string {
  if (!iso) return "—"
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "—"
  const formatted = dateFormatter(tz, style).format(date)
  if (style === "long") return formatted.replace(",", "")
  if (style === "time") return formatted.toLowerCase()
  return formatted
}

/** `Loaded Oct 1, 2026 · 9:14 am` — the CRM-exports card's timestamp, rendered in the agency's time zone. */

const DATE_PARTS: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }

const cache = new Map<string, { day: Intl.DateTimeFormat; time: Intl.DateTimeFormat }>()

function safeZone(tz: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz })
    return tz
  } catch {
    return "UTC"
  }
}

/** The kit's `formatDate` has no year style (the handoff shows one), so format the two parts here. */
export function loadedLabel(iso: string | null | undefined, tz: string): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const zone = safeZone(tz)
  let formatters = cache.get(zone)
  if (!formatters) {
    formatters = {
      day: new Intl.DateTimeFormat("en-US", { timeZone: zone, ...DATE_PARTS }),
      time: new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit", hour12: true }),
    }
    cache.set(zone, formatters)
  }
  return `${formatters.day.format(date)} · ${formatters.time.format(date).toLowerCase()}`
}

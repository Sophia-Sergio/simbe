import type { Agency } from "@/api/types"

const labelCache = new Map<string, string>()

/** "America/Los_Angeles" → "Pacific time"; unknown zones fall back to the raw id. */
function timeZoneLabel(timeZone: string): string {
  const cached = labelCache.get(timeZone)
  if (cached) return cached
  const label = computeLabel(timeZone)
  labelCache.set(timeZone, label)
  return label
}

function computeLabel(timeZone: string): string {
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longGeneric" })
      .formatToParts(new Date())
      .find((entry) => entry.type === "timeZoneName")
    return part ? part.value.replace(/\bTime\b/, "time") : timeZone
  } catch {
    return timeZone
  }
}

/** The signed-in agency. Inert: one agency per login, so there is nothing to switch to. */
export function AgencySwitcher({ agency, collapsed }: { agency: Agency; collapsed: boolean }) {
  const tile = (
    <span
      aria-hidden
      className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-tile bg-dark text-[12px] font-semibold text-white"
    >
      {agency.name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  )
  if (collapsed) {
    return (
      <div title={agency.name} className="flex justify-center py-1">
        {tile}
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2 rounded-card border border-line px-2.5 py-2">
      {tile}
      <div className="min-w-0 flex-1">
        <p title={agency.name} className="truncate text-[13px] font-semibold text-ink">
          {agency.name}
        </p>
        <p className="truncate text-[11px] text-ink-muted">{timeZoneLabel(agency.timezone)}</p>
      </div>
    </div>
  )
}

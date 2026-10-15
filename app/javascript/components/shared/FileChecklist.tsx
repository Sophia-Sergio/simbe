import { formatInt } from "@/lib/format"
import { Pill } from "@/components/ui/Pill"

/** The seven CSV basenames the exporter produces (matched case-insensitively by the API). */
export const EXPORT_FILES = [
  "leads.csv",
  "stage_history.csv",
  "contact_log.csv",
  "screener_answers.csv",
  "web_sessions.csv",
  "appointments.csv",
  "applications.csv",
] as const

/** Seven rows: status dot + file name + Loaded/Waiting pill (+ optional row count). */
export function FileChecklist({
  expected = EXPORT_FILES,
  present,
  statuses,
}: {
  expected?: readonly string[]
  present: string[]
  statuses?: Record<string, number>
}) {
  const presentLower = present.map((name) => name.toLowerCase())
  return (
    <ul className="flex flex-col divide-y divide-line-subtle">
      {expected.map((name) => {
        const loaded = presentLower.includes(name.toLowerCase())
        const rows = statuses?.[name]
        return (
          <li key={name} className="flex items-center gap-3 py-2.5">
            <span className={`h-2 w-2 shrink-0 rounded-full ${loaded ? "bg-success" : "bg-line-strong"}`} />
            <span className="flex-1 truncate text-[13px] text-ink" title={name}>
              {name}
            </span>
            {loaded && rows !== undefined ? <span className="text-[12px] text-ink-muted">{formatInt(rows)}</span> : null}
            <Pill tone={loaded ? "success" : "neutral"}>{loaded ? "Loaded" : "Waiting"}</Pill>
          </li>
        )
      })}
    </ul>
  )
}

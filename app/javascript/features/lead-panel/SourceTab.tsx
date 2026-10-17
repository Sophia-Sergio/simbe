import type { LeadDetail } from "@/api/types"
import { formatDate } from "@/lib/format"

export function SourceTab({ source, tz }: { source: LeadDetail["source"]; tz: string }) {
  const rows: [string, string][] = [
    ["Channel", source.channel],
    ["Campaign", source.campaign ?? "—"],
    ["Ad", source.ad ?? "—"],
    ["First visit", formatDate(source.first_visit, tz, "short")],
    ["Pages viewed", source.pages_viewed.toLocaleString("en-US")],
    ["Self-reported", "Not collected"],
  ]

  return (
    <dl data-testid="source-rows" className="divide-y divide-line-subtle">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-center justify-between gap-3 py-2.5">
          <dt className="text-[13px] text-ink-muted">{label}</dt>
          <dd className="text-[13px] font-medium text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

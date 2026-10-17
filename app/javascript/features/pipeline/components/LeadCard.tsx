import type { LeadCard as LeadCardData } from "@/api/types"
import { ProgressBar } from "@/components/ui/ProgressBar"
import { SourcePill } from "@/components/ui/SourcePill"
import { StatusPill } from "@/components/ui/StatusPill"
import { formatDate } from "@/lib/format"
import { ageState } from "../lib"

/**
 * One pipeline lead: name + source/status pills, `28 yrs | CA` with the snapshot date on the right,
 * and the six-segment stage bar. The whole card is a button that opens the lead panel.
 */
export function LeadCard({ lead, timezone, onOpen }: { lead: LeadCardData; timezone: string; onOpen: (id: string) => void }) {
  const meta = ageState(lead)
  return (
    <button
      type="button"
      onClick={() => onOpen(lead.id)}
      className="w-full rounded-card border border-line bg-surface p-3 text-left shadow-card transition-colors hover:border-line-strong"
    >
      <span className="flex flex-wrap items-center gap-1.5">
        <span className="min-w-0 truncate text-[13px] font-semibold text-ink">{lead.name}</span>
        <SourcePill channel={lead.channel} />
        <StatusPill status={lead.status} />
      </span>
      <span className="mt-1.5 flex items-center justify-between gap-2 text-[12px] text-ink-muted">
        <span>{meta}</span>
        <span>{formatDate(lead.date, timezone)}</span>
      </span>
      <span className="mt-2 block">
        <ProgressBar segments={lead.segments} label={`${lead.name} stage progress`} />
      </span>
    </button>
  )
}

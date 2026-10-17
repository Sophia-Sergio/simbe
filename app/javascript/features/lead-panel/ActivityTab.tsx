import type { LeadDetail } from "@/api/types"
import { Timeline } from "@/components/ui/Timeline"
import { formatDate } from "@/lib/format"

export function ActivityTab({ activity, tz }: { activity: LeadDetail["activity"]; tz: string }) {
  if (activity.length === 0) return <p className="text-[13px] text-ink-muted">No activity recorded yet.</p>
  return (
    <Timeline
      items={activity.map((item) => ({ at: item.at, title: item.title, detail: item.detail ?? undefined }))}
      formatAt={(iso) => formatDate(iso, tz, "short")}
    />
  )
}

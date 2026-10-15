import { useAuth } from "@/app/auth/useAuth"
import { useCurrentSnapshot } from "@/api/hooks/snapshots"
import { Pill } from "@/components/ui/Pill"
import { formatDate } from "@/lib/format"

/** Top-bar data freshness: the snapshot date, or the load progress while an upload is committing. */
export function SnapshotPill() {
  const { agency } = useAuth()
  const { data } = useCurrentSnapshot()
  if (!data) return null
  if (data.pending) {
    const pct = data.pending.progress?.pct
    return (
      <Pill tone="brand">
        <span role="status">{`Loading data…${typeof pct === "number" ? ` ${Math.round(pct)}%` : ""}`}</span>
      </Pill>
    )
  }
  if (!data.snapshot) return null
  return <Pill tone="outline">{`Snapshot ${formatDate(data.snapshot.as_of, agency?.timezone ?? "UTC")}`}</Pill>
}

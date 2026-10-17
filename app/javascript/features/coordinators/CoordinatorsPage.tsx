import { Link } from "react-router-dom"
import { useCoordinators } from "@/api/hooks/coordinators"
import { useCurrentSnapshot } from "@/api/hooks/snapshots"
import type { CoordinatorRow } from "@/api/types"
import { useAuth } from "@/app/auth/useAuth"
import { LoadingYourData } from "@/components/shared/LoadingYourData"
import { Avatar } from "@/components/ui/Avatar"
import { EmptyState } from "@/components/ui/EmptyState"
import { ErrorState } from "@/components/ui/ErrorState"
import { Pill } from "@/components/ui/Pill"
import { Skeleton } from "@/components/ui/Skeleton"
import { StatusPill } from "@/components/ui/StatusPill"
import { formatDuration, formatInt, formatPct } from "@/lib/format"
import { COORDINATOR_STATUS, CoordinatorNoData } from "./lib"

/** One stat in a card footer: a muted label over a display-font value (handoff §8). */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[12px] text-ink-muted">{label}</p>
      <p className="mt-0.5 truncate font-display text-[16px] font-semibold tabular-nums text-ink">{value}</p>
    </div>
  )
}

/** A person card: avatar, name, `N leads · X% of leads`, status pill and the three stats. Links to the detail. */
function CoordinatorCard({ coordinator }: { coordinator: CoordinatorRow }) {
  return (
    <Link
      to={`/coordinators/${encodeURIComponent(coordinator.name)}`}
      className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-card transition-colors hover:border-line-strong"
    >
      <div className="flex items-start gap-3">
        <Avatar name={coordinator.name} size={36} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[15px] font-semibold text-ink">{coordinator.name}</p>
          <p className="text-[12px] text-ink-muted">
            {formatInt(coordinator.leads)} leads · {formatPct(coordinator.share_pct, 0)} of leads
          </p>
        </div>
        <StatusPill status={COORDINATOR_STATUS[coordinator.status]} />
      </div>
      <div className="grid grid-cols-3 gap-2 border-t border-line-subtle pt-3">
        <Stat label="First reply" value={formatDuration(coordinator.first_reply_minutes)} />
        <Stat label="Qualified" value={formatPct(coordinator.qualified_rate)} />
        <Stat label="Overdue" value={formatInt(coordinator.overdue)} />
      </div>
    </Link>
  )
}

function PageSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className="h-[150px] w-full" />
        ))}
      </div>
    </div>
  )
}

/**
 * Owner-only coordinator grid (handoff §8). Stats cover every lead in the snapshot; the endpoint has no
 * date range. While a snapshot load is in flight the screen shows `LoadingYourData`, and with no snapshot
 * at all the owner is pointed at Data sources.
 */
export function CoordinatorsPage() {
  const { role } = useAuth()
  const coordinators = useCoordinators()
  const snapshot = useCurrentSnapshot()

  // Declared before the early returns: hooks must run in the same order on every render.
  if (coordinators.isLoading || snapshot.isLoading) return <PageSkeleton />
  if (coordinators.isError) {
    return <ErrorState message="We couldn't load coordinator stats." onRetry={() => void coordinators.refetch()} />
  }
  // A failed snapshot call is not "no data": say so and let the user retry it (rule 9).
  if (snapshot.isError) {
    return <ErrorState message="We couldn't load your data." onRetry={() => void snapshot.refetch()} />
  }

  const pending = snapshot.data?.pending ?? null
  const rows = coordinators.data ?? []

  let body
  if (pending) {
    body = <LoadingYourData progress={pending.progress} />
  } else if (!snapshot.data?.snapshot) {
    body = <CoordinatorNoData role={role} />
  } else if (rows.length === 0) {
    body = (
      <EmptyState title="No coordinators yet" body="Coordinator stats appear once your leads have an assigned coordinator." />
    )
  } else {
    body = (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
        {rows.map((row) => (
          <CoordinatorCard key={row.name} coordinator={row} />
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h1 className="font-display text-[24px] font-semibold tracking-[-0.02em] text-ink">Coordinators</h1>
          <Pill tone="brand">Owner only</Pill>
        </div>
        <p className="text-[13px] text-ink-muted">Follow-up speed and outcomes by person.</p>
      </header>

      {body}

      <p className="text-[13px] text-ink-muted">
        First reply is the median time from signup to the first outbound message. Differences can reflect lead mix as well as
        effort.
      </p>
    </div>
  )
}

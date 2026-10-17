import { ArrowLeft } from "lucide-react"
import { Link, useParams } from "react-router-dom"
import { ApiError } from "@/api/client"
import { useCoordinator } from "@/api/hooks/coordinators"
import { useCurrentSnapshot } from "@/api/hooks/snapshots"
import type { CoordinatorDetail, QueueKey } from "@/api/types"
import { useAuth } from "@/app/auth/useAuth"
import { useLeadPanel } from "@/app/leadPanel"
import { LoadingYourData } from "@/components/shared/LoadingYourData"
import { Avatar } from "@/components/ui/Avatar"
import { EmptyState } from "@/components/ui/EmptyState"
import { ErrorState } from "@/components/ui/ErrorState"
import { KpiCard } from "@/components/ui/KpiCard"
import { Skeleton } from "@/components/ui/Skeleton"
import { StatusPill } from "@/components/ui/StatusPill"
import { formatDuration, formatInt, formatPct } from "@/lib/format"
import { barPct, COORDINATOR_STATUS, CoordinatorNoData } from "./lib"

type NeedsAction = CoordinatorDetail["needs_action"][number]

// Queue titles come from the next-actions contract (spec decision 8); a lead's queue is stable, so the
// detail list reads the same words as the coordinator's own queue wells.
const QUEUE_LABEL: Record<QueueKey, string> = {
  text_back_now: "Text back now",
  nudge_applications: "Nudge applications",
  rebook_consults: "Rebook consults",
  paused_due_back: "Paused, due back",
}

/**
 * One "Leads needing action" row. A real button (not a table row) so its accessible name — the lead
 * plus the reason — reaches keyboard and screen-reader users, and click/Enter both open the lead panel.
 */
function NeedsActionRow({ item, onOpen }: { item: NeedsAction; onOpen: (leadId: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(item.lead_id)}
      aria-label={`${item.name} — ${item.reason}`}
      className="flex w-full flex-col gap-1 rounded-row border border-line bg-surface px-3 py-2.5 text-left transition-colors hover:border-line-strong md:flex-row md:items-center md:gap-3"
    >
      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">{item.name}</span>
      <span className="text-[12px] text-ink-muted md:w-[150px] md:shrink-0">{QUEUE_LABEL[item.queue]}</span>
      <span className="text-[12px] text-ink-muted md:min-w-0 md:flex-[2] md:truncate">{item.reason}</span>
      <span className="text-[12px] tabular-nums text-ink-muted md:w-[44px] md:shrink-0 md:text-right">
        {formatDuration(item.age_minutes)}
      </span>
    </button>
  )
}

/**
 * Owner-only coordinator detail (handoff §8): back link, person header, the 4 KPIs and the
 * "Leads needing action" list. Every row opens the lead panel on that lead.
 */
export function CoordinatorPage() {
  const { name = "" } = useParams()
  const { role } = useAuth()
  const { open } = useLeadPanel()
  const detail = useCoordinator(name)
  const snapshot = useCurrentSnapshot()

  const back = (
    <Link to="/coordinators" className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-text">
      <ArrowLeft aria-hidden className="h-4 w-4" />
      Coordinators
    </Link>
  )

  if (detail.isLoading || snapshot.isLoading) {
    return (
      <div className="flex flex-col gap-5">
        {back}
        <Skeleton className="h-[260px]" />
      </div>
    )
  }

  if (detail.isError || !detail.data) {
    const missing = detail.error instanceof ApiError && detail.error.status === 404
    return (
      <div className="flex flex-col gap-5">
        {back}
        {missing ? (
          <EmptyState
            title="We couldn't find that coordinator"
            body="They may have been renamed or have no leads in this snapshot."
          />
        ) : (
          <ErrorState message="We could not load this coordinator." onRetry={() => void detail.refetch()} />
        )}
      </div>
    )
  }

  // A failed snapshot call is not "no data": say so and let the user retry it (rule 9).
  if (snapshot.isError) {
    return (
      <div className="flex flex-col gap-5">
        {back}
        <ErrorState message="We couldn't load your data." onRetry={() => void snapshot.refetch()} />
      </div>
    )
  }

  const pending = snapshot.data?.pending ?? null
  const coordinator = detail.data
  const { kpis, needs_action: needsAction } = coordinator

  let body
  if (pending) {
    body = <LoadingYourData progress={pending.progress} />
  } else if (!snapshot.data?.snapshot) {
    body = <CoordinatorNoData role={role} />
  } else {
    body = (
      <>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard label="Leads" value={formatInt(kpis.leads)} bar={{ kind: "fill", pct: barPct(100) }} />
          <KpiCard
            label="Qualified"
            value={formatInt(kpis.qualified)}
            bar={{ kind: "fill", pct: barPct(kpis.leads > 0 ? (kpis.qualified / kpis.leads) * 100 : 0) }}
          />
          <KpiCard
            label="Qualified rate"
            value={formatPct(kpis.qualified_rate)}
            bar={{ kind: "fill", pct: barPct(kpis.qualified_rate) }}
          />
          {/* KpiCard requires a bar, but a median duration has no 0–100 scale: the track stays empty
              and neutral (never a "100%" that would read as good) with a note that says what it is. */}
          <KpiCard
            label="First reply"
            value={formatDuration(kpis.first_reply_minutes)}
            note="Median across all leads"
            bar={{ kind: "fill", pct: barPct(0) }}
          />
        </div>

        <section aria-labelledby="needs-action-heading" className="rounded-card border border-line bg-surface p-3">
          <h2 id="needs-action-heading" className="px-1 pb-2 font-display text-[16px] font-semibold text-ink">
            Leads needing action
          </h2>
          <div aria-hidden className="hidden gap-3 px-1 pb-2 text-[12px] font-medium text-ink-muted md:flex">
            <span className="flex-1">Lead</span>
            <span className="w-[150px] shrink-0">Queue</span>
            <span className="flex-[2]">Reason</span>
            <span className="w-[44px] shrink-0 text-right">Age</span>
          </div>
          {needsAction.length === 0 ? (
            <p className="px-1 py-2 text-[13px] text-ink-muted">Nothing needs action right now</p>
          ) : (
            <div className="flex flex-col gap-2">
              {needsAction.map((item) => (
                <NeedsActionRow key={item.lead_id} item={item} onOpen={open} />
              ))}
            </div>
          )}
        </section>
      </>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {back}
      <header className="flex items-center gap-3">
        <Avatar name={coordinator.name} size={44} />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2">
            <h1 className="truncate font-display text-[24px] font-semibold tracking-[-0.02em] text-ink">{coordinator.name}</h1>
            <StatusPill status={COORDINATOR_STATUS[coordinator.status]} />
          </div>
          <p className="text-[13px] text-ink-muted">
            {formatInt(coordinator.leads)} leads · {formatPct(coordinator.share_pct, 0)} of leads
          </p>
        </div>
      </header>

      {body}
    </div>
  )
}

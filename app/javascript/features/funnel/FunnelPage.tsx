import { Link } from "react-router-dom"
import { useCurrentSnapshot } from "@/api/hooks/snapshots"
import { useFunnel } from "@/api/hooks/metrics"
import type { Funnel } from "@/api/types"
import { useAuth } from "@/app/auth/useAuth"
import { BarRow } from "@/components/ui/BarRow"
import type { BarTone } from "@/components/ui/BarRow"
import { EmptyState } from "@/components/ui/EmptyState"
import { ErrorState } from "@/components/ui/ErrorState"
import { Pill } from "@/components/ui/Pill"
import { RangeControl } from "@/components/ui/RangeControl"
import { Skeleton } from "@/components/ui/Skeleton"
import { LoadingYourData } from "@/components/shared/LoadingYourData"
import { definitionLabel } from "@/components/shared/options"
import { useRange } from "@/hooks/useRange"
import { formatInt, formatPct } from "@/lib/format"

const humanize = (value: string) => {
  const text = value.replace(/_/g, " ")
  return text.charAt(0).toUpperCase() + text.slice(1)
}

type Stage = Funnel["stages"][number]

/** One decimal at most, none when whole: 50 -> "50%", 33.33 -> "33.3%", 99.96 -> "100%". */
const pct = (value: number) => formatPct(value, Math.round(value * 10) % 10 === 0 ? 0 : 1)

/** "50% leave here · age, bmi": the next row's drop, then the top exit reasons (omitted when none). */
function exitLine(stage: Stage, next: Stage | undefined): string | null {
  if (!next || next.pct_of_previous === null) return null
  const left = 100 - next.pct_of_previous
  const reasons = stage.exit_reasons.map((entry) => entry.reason)
  return `${pct(left)} leave here${reasons.length ? ` · ${reasons.join(", ")}` : ""}`
}

export function FunnelPage() {
  const { agency, role } = useAuth()
  const [range, setRange] = useRange()
  const funnel = useFunnel(range)
  const snapshot = useCurrentSnapshot()

  const header = (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="hidden font-display text-[24px] font-semibold tracking-[-0.02em] text-ink md:block">Funnel</h1>
          {funnel.data && funnel.data.total > 0 && (
            <Pill tone="neutral">{`${formatInt(funnel.data.total)} ${funnel.data.total === 1 ? "lead" : "leads"}`}</Pill>
          )}
        </div>
        <p className="mt-0.5 text-[14px] text-ink-muted">
          Qualified = {definitionLabel(agency?.qualified_milestone ?? "consult_attended")}
        </p>
      </div>
      <RangeControl value={range} onChange={setRange} />
    </header>
  )

  if (funnel.isPending || snapshot.isPending) {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <Skeleton className="h-[420px]" />
      </div>
    )
  }
  if (funnel.isError) {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <ErrorState message="We could not load the funnel." onRetry={() => void funnel.refetch()} />
      </div>
    )
  }

  const { total, stages, form_dropoff: dropoff } = funnel.data
  if (!snapshot.data?.snapshot) {
    const pending = snapshot.data?.pending
    return (
      <div className="flex flex-col gap-5">
        {header}
        {pending ? (
          <LoadingYourData progress={pending.progress} />
        ) : (
          <EmptyState
            title="No data yet"
            body="The funnel appears here once a lead export is loaded."
            action={
              role === "owner" ? (
                <Link to="/data" className="font-semibold text-brand-text">
                  Load your data
                </Link>
              ) : (
                <span className="text-ink-muted">Ask your agency owner to load data</span>
              )
            }
          />
        )}
      </div>
    )
  }

  if (total === 0) {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <EmptyState title="No leads in this range" body="Try a longer range to see your funnel." />
      </div>
    )
  }

  const qualifiedIndex = stages.findIndex((stage) => stage.qualified)
  const toneAt = (index: number): BarTone => (qualifiedIndex === -1 || index < qualifiedIndex ? "dark" : index === qualifiedIndex ? "brand" : "success")
  const worst = dropoff.reduce((max, entry) => Math.max(max, entry.pct), 0)
  const worstIndex = worst > 0 ? dropoff.findIndex((entry) => entry.pct === worst) : -1

  return (
    <div className="flex flex-col gap-5">
      {header}
      <section aria-label="Funnel stages" className="rounded-card border border-line bg-surface p-5">
        <ol className="flex flex-col gap-5">
          {stages.map((stage, index) => {
            const exit = exitLine(stage, stages[index + 1])
            return (
              <li key={stage.key}>
                <BarRow
                  label={stage.label}
                  value={formatInt(stage.count)}
                  pct={stage.pct_of_total}
                  tone={toneAt(index)}
                  labelClassName={stage.qualified ? "font-medium text-brand-text" : undefined}
                  right={
                    <span className="text-[12px] text-ink-muted">
                      {stage.pct_of_previous === null ? "" : `${pct(stage.pct_of_previous)} of previous`}
                    </span>
                  }
                />
                {exit && <p className="mt-1 text-[12px] text-ink-muted">{exit}</p>}
              </li>
            )
          })}
        </ol>
      </section>

      {dropoff.length > 0 && (
        <section aria-labelledby="form-heading" className="rounded-card border border-line bg-surface p-5">
          <h2 id="form-heading" className="mb-4 font-display text-[16px] font-semibold text-ink">
            Where applicants stop in the form
          </h2>
          <div className="flex flex-col gap-3">
            {dropoff.map((entry, index) => (
              <BarRow
                key={entry.section}
                label={humanize(entry.section)}
                value={`${formatInt(entry.count)} · ${pct(entry.pct)}`}
                pct={entry.pct}
                tone={index === worstIndex ? "warning" : "muted"}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

import { useEffect, useRef } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useCurrentSnapshot } from "@/api/hooks/snapshots"
import { useRecommendations, useSummary } from "@/api/hooks/metrics"
import type { Summary } from "@/api/types"
import { useAgent } from "@/app/agent"
import { useAuth } from "@/app/auth/useAuth"
import { Donut } from "@/components/ui/Donut"
import { BarRow } from "@/components/ui/BarRow"
import type { BarTone } from "@/components/ui/BarRow"
import { EmptyState } from "@/components/ui/EmptyState"
import { ErrorState } from "@/components/ui/ErrorState"
import { KpiCard } from "@/components/ui/KpiCard"
import { RangeControl } from "@/components/ui/RangeControl"
import { Skeleton } from "@/components/ui/Skeleton"
import { LoadingYourData } from "@/components/shared/LoadingYourData"
import { definitionLabel } from "@/components/shared/options"
import { useRange } from "@/hooks/useRange"
import { formatDate, formatDelta, formatInt, formatMoney, formatPct } from "@/lib/format"
import type { Range } from "@/lib/format"
import { RecommendationCard } from "./RecommendationCard"

const RANGE_LABEL: Record<Range, string> = { "30d": "30 days", "90d": "90 days", "12m": "12 months" }

export function greeting(hour: number): string {
  if (hour < 12) return "Good morning"
  if (hour < 18) return "Good afternoon"
  return "Good evening"
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

/** Hour of day (0-23) in the agency's time zone: the greeting follows the agency, not the browser. */
export function hourIn(timeZone: string, now = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).format(now))
}

/** Monday of the week containing `iso`, formatted in the agency time zone ("Oct 12"). The calendar date is taken in the zone first, so a DST change inside the week cannot shift it. */
export function weekOf(iso: string, timeZone: string): string {
  const date = new Date(iso)
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric", weekday: "short" })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  )
  const daysSinceMonday = (WEEKDAYS.indexOf(parts.weekday) + 6) % 7
  const monday = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) - daysSinceMonday, 12))
  return formatDate(monday.toISOString(), "UTC")
}

/** "+2.5" -> "+2.5 pp": the formatter leaves the unit to the caller for percentage points. */
const withUnit = <T extends { text: string }>(delta: T, unit: string): T => ({ ...delta, text: delta.text && delta.text !== "0" ? `${delta.text}${unit}` : delta.text })

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)
const pctOf = (part: number, whole: number) => (whole > 0 ? Math.max(0, Math.min(100, (part / whole) * 100)) : 0)

function costBars(rows: Summary["cost_by_channel"]) {
  const max = Math.max(1, ...rows.map((row) => row.cost_per_qualified_cents ?? 0))
  return rows.map((row) => {
    const tone: BarTone = row.flag === "best" ? "success" : row.flag === "worst" ? "danger" : "muted"
    return { key: row.channel, label: row.channel, value: formatMoney(row.cost_per_qualified_cents), pct: pctOf(row.cost_per_qualified_cents ?? 0, max), tone }
  })
}

/** Money delta ("+$50"), coloured in reverse: a rising cost per qualified lead is bad news. */
export function costDelta(deltaCents: number | null) {
  if (deltaCents === null || Math.round(deltaCents) === 0) return { text: deltaCents === null ? "" : "$0", tone: "none" as const }
  const sign = deltaCents > 0 ? "+" : "−"
  return { text: `${sign}${formatMoney(Math.abs(deltaCents))}`, tone: deltaCents > 0 ? ("down" as const) : ("up" as const) }
}

/** 0 = green, 1 = amber, 2 = red, from where this cost sits between the best and worst channel. */
function costActive(cents: number | null, rows: Summary["cost_by_channel"]): 0 | 1 | 2 {
  const costs = rows.map((row) => row.cost_per_qualified_cents).filter((value): value is number => value !== null)
  if (cents === null || costs.length < 2) return 0
  const best = Math.min(...costs)
  const worst = Math.max(...costs)
  if (cents <= best * 1.15) return 0
  if (cents >= worst * 0.85) return 2
  return 1
}

export function WeekPage() {
  const { user, agency, role } = useAuth()
  const [range, setRange] = useRange()
  const summary = useSummary(range)
  const recommendations = useRecommendations(range)
  const snapshot = useCurrentSnapshot()
  const agent = useAgent()
  const navigate = useNavigate()

  const timeZone = agency?.timezone ?? "UTC"

  // An upload that finishes while this page is open turns "no snapshot" into data: refetch once it does.
  const pendingNow = Boolean(snapshot.data?.pending)
  const wasPending = useRef(false)
  const { refetch: refetchSummary } = summary
  const { refetch: refetchRecommendations } = recommendations
  useEffect(() => {
    if (wasPending.current && !pendingNow) {
      void refetchSummary()
      void refetchRecommendations()
    }
    wasPending.current = pendingNow
  }, [pendingNow, refetchSummary, refetchRecommendations])
  const firstName = user?.name.split(/\s+/)[0] ?? ""
  const recs = recommendations.data ?? []

  const header = (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-[24px] font-semibold tracking-[-0.02em] text-ink">
          {greeting(hourIn(timeZone))}, {firstName}
        </h1>
        {summary.data?.snapshot && (
          <p className="mt-0.5 text-[14px] text-ink-muted">
            Week of {weekOf(summary.data.snapshot.as_of, timeZone)}
            {recommendations.isSuccess && ` · ${recs.length} ${recs.length === 1 ? "thing" : "things"} worth your time`}
          </p>
        )}
      </div>
      <RangeControl value={range} onChange={setRange} />
    </header>
  )

  if (summary.isPending || (snapshot.isPending && !summary.data?.snapshot)) {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-[120px]" />
          ))}
        </div>
        <Skeleton className="h-[260px]" />
      </div>
    )
  }

  if (summary.isError) {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <ErrorState message="We could not load this week's numbers." onRetry={() => void summary.refetch()} />
      </div>
    )
  }

  const data = summary.data
  if (!data.snapshot) {
    const pending = snapshot.data?.pending
    return (
      <div className="flex flex-col gap-5">
        {header}
        {pending ? (
          <LoadingYourData progress={pending.progress} />
        ) : (
          <EmptyState
            title="No data yet"
            body="Your insights appear here once a lead export is loaded."
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

  const { kpis, biggest_leak: leak } = data
  const leadsPrevious = kpis.leads.previous ?? kpis.leads.value
  const sample = data.spend_source === "sample"
  const bars = costBars(data.cost_by_channel)

  return (
    <div className="flex flex-col gap-5">
      {header}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard
          label="Leads"
          value={formatInt(kpis.leads.value)}
          delta={formatDelta(kpis.leads.delta)}
          note={RANGE_LABEL[range]}
          bar={{ kind: "fill", pct: pctOf(kpis.leads.value, Math.max(kpis.leads.value, leadsPrevious)) }}
        />
        <KpiCard
          label="Qualified"
          value={formatInt(kpis.qualified.value)}
          delta={formatDelta(kpis.qualified.delta)}
          note={capitalize(definitionLabel(agency?.qualified_milestone ?? "consult_attended"))}
          bar={{ kind: "fill", pct: pctOf(kpis.qualified.value, kpis.leads.value) }}
        />
        <KpiCard
          label="Qualified rate"
          value={formatPct(kpis.qualified_rate.value)}
          delta={withUnit(formatDelta(kpis.qualified_rate.delta, "pp"), " pp")}
          note="Recent leads still maturing"
          bar={{ kind: "fill", pct: kpis.qualified_rate.value }}
        />
        <KpiCard
          label="Cost per qualified"
          value={formatMoney(kpis.cost_per_qualified.value_cents)}
          delta={costDelta(kpis.cost_per_qualified.delta_cents)}
          note={data.spend_source === "none" ? "No spend loaded" : sample ? "Sample spend" : "Paid spend"}
          bar={{ kind: "thirds", active: costActive(kpis.cost_per_qualified.value_cents, data.cost_by_channel) }}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-[1.6fr_1fr]">
        <section aria-labelledby="recs-heading" className="rounded-card border border-line bg-subtle p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="recs-heading" className="font-display text-[16px] font-semibold text-ink">
              Recommended actions
            </h2>
            <span className="rounded-full border border-line bg-surface px-2 text-[12px] font-semibold text-ink-secondary">{recs.length}</span>
          </div>
          {recommendations.isError ? (
            <ErrorState message="We could not load recommendations." onRetry={() => void recommendations.refetch()} />
          ) : recs.length === 0 ? (
            <p className="text-[13px] text-ink-muted">Nothing needs your attention right now.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {recs.map((rec) => (
                <RecommendationCard
                  key={rec.id}
                  rec={rec}
                  onAsk={(question) => agent.open(question)}
                  onOpen={(route) => navigate(`${route}?range=${range}`)}
                />
              ))}
            </div>
          )}
        </section>

        <div className="flex flex-col gap-4">
          {leak && (
            <section className="rounded-card border border-line bg-surface p-4">
              <div className="flex items-center gap-4">
                <Donut pct={leak.pct_lost} label={`${Math.round(leak.pct_lost)}%`} sublabel="stall" />
                <div className="min-w-0">
                  <h2 className="text-[14px] font-semibold text-ink">
                    Biggest leak: {leak.from_stage} → {leak.to_stage}
                  </h2>
                  <p className="mt-1 text-[13px] text-ink-secondary">
                    {formatPct(leak.pct_lost, 0)} of leads never reach {leak.to_stage} ({formatInt(leak.lost)} leads).
                  </p>
                </div>
              </div>
            </section>
          )}
          {bars.length > 0 && (
            <section className="rounded-card border border-line bg-surface p-4">
              <h2 className="mb-3 font-display text-[16px] font-semibold text-ink">Cost per qualified</h2>
              <div className="flex flex-col gap-3">
                {bars.map((bar) => (
                  <BarRow key={bar.key} label={bar.label} value={bar.value} pct={bar.pct} tone={bar.tone} />
                ))}
              </div>
              {sample && <p className="mt-3 text-[12px] text-ink-muted">sample</p>}
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

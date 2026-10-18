import { ArrowLeft, Sparkles } from "lucide-react"
import { Link, useParams } from "react-router-dom"
import { useChannel, useChannels } from "@/api/hooks/metrics"
import { ApiError } from "@/api/client"
import type { ChannelDetail } from "@/api/types"
import { useAgent } from "@/app/agent"
import { Button } from "@/components/ui/Button"
import { ChannelTile } from "@/components/ui/ChannelTile"
import { EmptyState } from "@/components/ui/EmptyState"
import { ErrorState } from "@/components/ui/ErrorState"
import { KpiCard } from "@/components/ui/KpiCard"
import { RangeControl } from "@/components/ui/RangeControl"
import { Skeleton } from "@/components/ui/Skeleton"
import { Table } from "@/components/ui/Table"
import type { Column } from "@/components/ui/Table"
import { useRange } from "@/hooks/useRange"
import { formatInt, formatMoney, formatPct } from "@/lib/format"

type Campaign = ChannelDetail["campaigns"][number]

const leadsLabel = (count: number) => `${formatInt(count)} ${count === 1 ? "lead" : "leads"}`

export function ChannelPage() {
  const params = useParams()
  const channel = params.channel ?? ""
  const [range, setRange] = useRange()
  const detail = useChannel(channel, range)
  const agent = useAgent()
  // The detail has no cost rating of its own: reuse the list's best/worst flag (cached from the channels page).
  const list = useChannels(range)

  const back = (
    <Link to={`/channels?range=${range}`} className="inline-flex min-h-11 items-center gap-1 text-[13px] font-medium text-brand-text">
      <ArrowLeft aria-hidden className="h-4 w-4" />
      Channels
    </Link>
  )

  if (detail.isPending) {
    return (
      <div className="flex flex-col gap-5">
        {back}
        <Skeleton className="h-[240px]" />
      </div>
    )
  }
  if (detail.isError && !detail.data) {
    const missing = detail.error instanceof ApiError && detail.error.status === 404
    return (
      <div className="flex flex-col gap-5">
        {back}
        {missing ? (
          <EmptyState title="We couldn't find that channel" action={<Link to={`/channels?range=${range}`} className="font-semibold text-brand-text">Back to channels</Link>} />
        ) : (
          <ErrorState message="We could not load this channel." onRetry={() => void detail.refetch()} />
        )}
      </div>
    )
  }

  const { kpis, campaigns } = detail.data!
  const name = detail.data!.channel
  const flag = list.data?.rows.find((row) => row.channel === name)?.flag ?? null
  const costBar =
    kpis.cost_per_qualified_cents === null
      ? ({ kind: "fill", pct: 0 } as const)
      : ({ kind: "thirds", active: flag === "best" ? 0 : flag === "worst" ? 2 : 1 } as const)
  const columns: Column<Campaign>[] = [
    { key: "campaign", header: "Campaign", render: (row) => <span className="font-medium text-ink">{row.campaign}</span> },
    { key: "ads", header: "Ads", align: "right", render: (row) => formatInt(row.ads) },
    { key: "leads", header: "Leads", align: "right", render: (row) => formatInt(row.leads) },
    { key: "qualified", header: "Qualified", align: "right", render: (row) => formatInt(row.qualified) },
    { key: "rate", header: "Rate", align: "right", render: (row) => formatPct(row.rate) },
    { key: "spend", header: "Spend", align: "right", render: (row) => formatMoney(row.spend_cents) },
    { key: "cost", header: "Per qualified", align: "right", render: (row) => formatMoney(row.cost_per_qualified_cents) },
  ]

  return (
    <div className="flex flex-col gap-5">
      {back}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ChannelTile channel={name} size={38} />
          <h1 className="hidden font-display text-[24px] font-semibold tracking-[-0.02em] text-ink md:block">{name}</h1>
          <h2 className="font-display text-[22px] font-semibold tracking-[-0.02em] text-ink md:hidden">{name}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <RangeControl value={range} onChange={setRange} />
          <Button
            variant="outline-brand"
            size="sm"
            leftIcon={<Sparkles aria-hidden className="h-3.5 w-3.5" />}
            onClick={() => agent.open(`How is ${name} performing and what should I change?`)}
          >
            Ask Simbe
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Leads" value={formatInt(kpis.leads)} bar={{ kind: "fill", pct: 100 }} />
        <KpiCard label="Qualified" value={formatInt(kpis.qualified)} bar={{ kind: "fill", pct: kpis.leads > 0 ? (kpis.qualified / kpis.leads) * 100 : 0 }} />
        <KpiCard label="Rate" value={formatPct(kpis.rate)} bar={{ kind: "fill", pct: kpis.rate }} />
        <KpiCard label="Per qualified" value={formatMoney(kpis.cost_per_qualified_cents)} note={kpis.spend_cents === null ? "No spend loaded" : `Spend ${formatMoney(kpis.spend_cents)}`} bar={costBar} />
      </div>

      <section aria-labelledby="campaigns-heading" className="overflow-hidden rounded-card border border-line bg-surface">
        <h2 id="campaigns-heading" className="px-4 pt-4 font-display text-[16px] font-semibold text-ink">
          Campaigns
        </h2>
        <div className="p-3 md:p-0">
        <Table
          columns={columns}
          rows={campaigns}
          rowKey={(row) => row.campaign}
          emptyText="No campaigns for this channel yet"
          renderCard={(row) => (
            <div>
              <p className="break-words text-[14px] font-semibold text-ink">{row.campaign}</p>
              <p className="mt-0.5 text-[12px] text-ink-muted">
                {leadsLabel(row.leads)} · {formatInt(row.qualified)} qualified · {formatPct(row.rate)}
              </p>
              <p className="text-[12px] text-ink-muted">Per qualified {formatMoney(row.cost_per_qualified_cents)}</p>
            </div>
          )}
        />
        </div>
      </section>

      <p className="rounded-card border border-brand-border bg-brand-tint p-4 text-[13px] text-ink-secondary">
        Campaign names come from the campaign tag on each lead; leads without one are grouped as “(untagged)”.
        {kpis.cost_per_qualified_cents === null && " Cost per qualified appears once ad spend is loaded for this channel."}
      </p>
    </div>
  )
}

import { Link, useNavigate } from "react-router-dom"
import { useCurrentSnapshot } from "@/api/hooks/snapshots"
import { useChannels } from "@/api/hooks/metrics"
import type { Channels } from "@/api/types"
import { useAuth } from "@/app/auth/useAuth"
import { ChannelTile } from "@/components/ui/ChannelTile"
import { EmptyState } from "@/components/ui/EmptyState"
import { ErrorState } from "@/components/ui/ErrorState"
import { InfoTip } from "@/components/ui/InfoTip"
import { Pill } from "@/components/ui/Pill"
import { RangeControl } from "@/components/ui/RangeControl"
import { Skeleton } from "@/components/ui/Skeleton"
import { Table } from "@/components/ui/Table"
import type { Column } from "@/components/ui/Table"
import { LoadingYourData } from "@/components/shared/LoadingYourData"
import { useRange } from "@/hooks/useRange"
import { formatInt, formatPct } from "@/lib/format"

type Row = Channels["rows"][number]

const leadsLabel = (count: number) => `${formatInt(count)} ${count === 1 ? "lead" : "leads"}`
/** 0 -> "0%", 0.4 -> "0.4%", 10 -> "10%": a share below 1% must not round to a misleading "0%". */
const share = (value: number) => formatPct(value, value > 0 && value < 1 ? 1 : 0)

function FlagPill({ row }: { row: Row }) {
  if (row.flag === null) return <span className="text-ink-muted">—</span>
  return <Pill tone={row.flag === "best" ? "success" : "danger"}>{row.flag === "best" ? "Best" : "Lowest"}</Pill>
}

function RateTip({ example }: { example: Row }) {
  return (
    <InfoTip label="How the rate is calculated">
      <span className="block font-semibold text-ink">Rate = qualified ÷ leads</span>
      <span className="mt-1 block">
        A lead is qualified once it reaches the milestone your agency uses (see Settings). For example, {example.channel}:{" "}
        {formatInt(example.qualified)} ÷ {formatInt(example.leads)} = {formatPct(example.rate)}.
      </span>
      <span className="mt-1 block">Best and Lowest compare this rate between channels with enough leads. Unknown is never ranked.</span>
    </InfoTip>
  )
}

function RateBar({ rate }: { rate: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden className="h-1.5 w-16 overflow-hidden rounded-full bg-subtle">
        <span className="block h-full rounded-full bg-success" style={{ width: `${Math.max(0, Math.min(100, rate))}%` }} />
      </span>
      {formatPct(rate)}
    </span>
  )
}

export function ChannelsPage() {
  const { role } = useAuth()
  const [range, setRange] = useRange()
  const channels = useChannels(range)
  const snapshot = useCurrentSnapshot()
  const navigate = useNavigate()

  const header = (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="hidden font-display text-[24px] font-semibold tracking-[-0.02em] text-ink md:block">Channels</h1>
        <p className="mt-0.5 text-[14px] text-ink-muted">Where your leads come from and how many qualify</p>
      </div>
      <RangeControl value={range} onChange={setRange} />
    </header>
  )

  if (channels.isPending) {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <Skeleton className="h-[320px]" />
      </div>
    )
  }
  if (channels.isError && !channels.data) {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <ErrorState message="We could not load your channels." onRetry={() => void channels.refetch()} />
      </div>
    )
  }

  const { rows, insights } = channels.data!
  if (rows.length === 0) {
    const pending = snapshot.data?.pending
    return (
      <div className="flex flex-col gap-5">
        {header}
        {pending ? (
          <LoadingYourData progress={pending.progress} />
        ) : (
          <EmptyState
            title="No data yet"
            body="Channel performance appears here once a lead export is loaded."
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

  const open = (row: Row) => navigate(`/channels/${encodeURIComponent(row.channel)}?range=${range}`)
  const columns: Column<Row>[] = [
    {
      key: "channel",
      header: "Channel",
      render: (row) => (
        <Link to={`/channels/${encodeURIComponent(row.channel)}?range=${range}`} className="flex items-center gap-2.5 font-medium text-ink">
          <ChannelTile channel={row.channel} size={28} />
          {row.channel}
        </Link>
      ),
    },
    { key: "leads", header: "Leads", align: "right", render: (row) => formatInt(row.leads) },
    { key: "qualified", header: "Qualified", align: "right", render: (row) => formatInt(row.qualified) },
    {
      key: "rate",
      header: (
        <span className="inline-flex items-center gap-1.5">
          Rate
          <RateTip example={rows[0]} />
        </span>
      ),
      align: "right",
      render: (row) => <RateBar rate={row.rate} />,
    },
    { key: "flag", header: "Standing", align: "right", render: (row) => <FlagPill row={row} /> },
  ]

  return (
    <div className="flex flex-col gap-5">
      {header}
      <p className="text-[13px] text-ink-muted">
        Ranked by number of leads; best and lowest compare qualified rate
        <span className="ml-1.5 inline-block align-middle md:hidden">
          <RateTip example={rows[0]} />
        </span>
      </p>
      <section aria-label="Channels" className="overflow-hidden rounded-card border border-line bg-surface">
        <Table
          columns={columns}
          rows={rows}
          rowKey={(row) => row.channel}
          onRowClick={open}
          emptyText="No channels"
          renderCard={(row) => (
            <div className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2.5">
                <ChannelTile channel={row.channel} size={36} />
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-semibold text-ink">{row.channel}</span>
                  <span className="block text-[12px] text-ink-muted">
                    {leadsLabel(row.leads)} · {formatPct(row.rate)} qualified
                  </span>
                </span>
              </span>
              <span className="shrink-0 text-right text-[12px] text-ink-muted">
                <FlagPill row={row} />
              </span>
            </div>
          )}
        />
      </section>
      <div className="grid gap-3 md:grid-cols-2">
        <section className="rounded-card border border-line bg-surface p-4">
          <p className="text-[14px] font-semibold text-ink">{share(insights.unattributed.pct)} of leads have no source</p>
          <p className="mt-1 text-[13px] text-ink-secondary">
            {formatInt(insights.unattributed.count)} {insights.unattributed.count === 1 ? "lead" : "leads"} arrived without a channel. Tag your ads so they can be attributed.
          </p>
        </section>
        <section className="rounded-card border border-line bg-surface p-4">
          <p className="text-[14px] font-semibold text-ink">
            {share(insights.out_of_area.pct)} of leads are outside your main states
          </p>
          <p className="mt-1 text-[13px] text-ink-secondary">
            {formatInt(insights.out_of_area.count)} {insights.out_of_area.count === 1 ? "lead" : "leads"} from outside {insights.out_of_area.main_states.join(", ") || "your main states"}.
          </p>
        </section>
      </div>
    </div>
  )
}

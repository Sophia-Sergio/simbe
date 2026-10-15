import { useState } from "react"
import type { ReactNode } from "react"
import uploadOk from "@contracts/examples/snapshots/upload-ok.json"
import { BarChart } from "@/components/ui/BarChart"
import { BarRow } from "@/components/ui/BarRow"
import { ChannelTile } from "@/components/ui/ChannelTile"
import { Donut } from "@/components/ui/Donut"
import { KpiCard } from "@/components/ui/KpiCard"
import { ProgressBar } from "@/components/ui/ProgressBar"
import { RangeControl } from "@/components/ui/RangeControl"
import { Ring } from "@/components/ui/Ring"
import { SegmentBar } from "@/components/ui/SegmentBar"
import { SourcePill } from "@/components/ui/SourcePill"
import { StatusPill } from "@/components/ui/StatusPill"
import { Table } from "@/components/ui/Table"
import { Timeline } from "@/components/ui/Timeline"
import { FileChecklist } from "@/components/shared/FileChecklist"
import { LoadingYourData } from "@/components/shared/LoadingYourData"
import { QualifiedRadioCards } from "@/components/shared/QualifiedRadioCards"
import { ReviewReport } from "@/components/shared/ReviewReport"
import { TimezoneChips } from "@/components/shared/TimezoneChips"
import type { Report } from "@/components/shared/ReviewReport"
import type { Milestone } from "@/components/shared/options"
import type { Range } from "@/lib/format"

export const title = "Data viz"
export const order = 20

function Card({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <div className="rounded-card border border-line bg-surface p-4 shadow-card">
      <h3 className="mb-3 text-[13px] font-semibold text-ink-secondary">{heading}</h3>
      {children}
    </div>
  )
}

type ChannelRow = {
  id: string
  channel: string
  leads: number
  qualified: number
  rate: string
  spend: string
  perQualified: string
  flag?: "best" | "worst"
}

const CHANNELS: ChannelRow[] = [
  { id: "fb", channel: "Facebook", leads: 1650, qualified: 120, rate: "7.3%", spend: "$18,000", perQualified: "$150", flag: "best" },
  { id: "ig", channel: "Instagram", leads: 920, qualified: 61, rate: "6.6%", spend: "$12,400", perQualified: "$203" },
  { id: "go", channel: "Google", leads: 540, qualified: 22, rate: "4.1%", spend: "$9,900", perQualified: "$450" },
  { id: "tt", channel: "TikTok", leads: 260, qualified: 9, rate: "3.5%", spend: "$4,200", perQualified: "$467", flag: "worst" },
  { id: "ref", channel: "Referral", leads: 120, qualified: 40, rate: "33.3%", spend: "—", perQualified: "—" },
  { id: "unk", channel: "Unknown", leads: 40, qualified: 4, rate: "10.0%", spend: "—", perQualified: "—" },
]

const LONG_CHANNEL = "A very long channel name that keeps going without a break"

const ACTIVITY = [
  { at: "2026-10-01T09:14:00Z", title: "Consult booked", detail: "Oct 4, 2:00 pm" },
  { at: "2026-09-30T15:00:00Z", title: "Application submitted", detail: "100% complete" },
  { at: "2026-09-28T11:30:00Z", title: "A very long activity title that has to be truncated to keep the row tidy", detail: "detail" },
  { at: "2026-09-20T08:00:00Z", title: "First web visit", detail: "facebook / c-a" },
]

export default function DataViz() {
  const [range, setRange] = useState<Range>("30d")
  const [milestone, setMilestone] = useState<Milestone>("consult_attended")
  const [timezone, setTimezone] = useState("America/Los_Angeles")

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card heading="KpiCard">
        <div className="grid grid-cols-2 gap-3">
          <KpiCard label="Leads" value="3,530" delta={{ text: "+6%", tone: "up" }} note="12 months" bar={{ kind: "fill", pct: 60 }} />
          <KpiCard label="Qualified" value="496" delta={{ text: "+4%", tone: "up" }} note="Attended a consult" bar={{ kind: "fill", pct: 30 }} />
          <KpiCard label="Qualified rate" value="14.1%" delta={{ text: "−0.3", tone: "down" }} note="Recent leads still maturing" bar={{ kind: "fill", pct: 14 }} />
          <KpiCard label="Cost per qualified" value="$145" delta={{ text: "", tone: "none" }} note="Paid spend $41,500" bar={{ kind: "thirds", active: 0 }} size="sm" />
        </div>
      </Card>

      <Card heading="SegmentBar">
        <div className="flex flex-col gap-4">
          <SegmentBar kind="fill" pct={60} />
          <SegmentBar kind="fill" pct={40} tone="brand" />
          <SegmentBar kind="thirds" active={1} />
          <SegmentBar kind="thirds" active={2} />
        </div>
      </Card>

      <Card heading="Donut / Ring">
        <div className="flex flex-wrap items-center gap-6">
          <Donut pct={27} label="27%" sublabel="stall" />
          <Ring met={7} review={1} notMet={1} unanswered={1} />
        </div>
      </Card>

      <Card heading="BarRow / ProgressBar">
        <div className="flex flex-col gap-4">
          {CHANNELS.slice(0, 4).map((row) => (
            <BarRow
              key={row.id}
              label={row.channel}
              value={row.perQualified}
              pct={row.id === "fb" ? 100 : row.id === "ig" ? 74 : row.id === "go" ? 33 : 18}
              tone={row.flag === "best" ? "success" : row.flag === "worst" ? "danger" : "muted"}
            />
          ))}
          <BarRow label={LONG_CHANNEL} value="$450" pct={33} />
          <ProgressBar segments={["done", "done", "current", "action", "todo", "todo"]} />
          <ProgressBar segments={["done", "done", "done", "done", "done", "current"]} />
          <ProgressBar segments={["done", "done", "closed", "todo", "todo", "todo"]} />
          <ProgressBar segments={["done", "done", "done", "action", "todo", "todo"]} />
        </div>
      </Card>

      <Card heading="BarChart (agent)">
        <BarChart
          title="Leads by channel"
          bars={[
            { label: "Facebook", value: 1650, display: "1,650" },
            { label: "Google", value: 540, display: "540" },
            { label: "TikTok", value: 260, display: "260" },
            { label: "Referral", value: 0, display: "0" },
          ]}
        />
      </Card>

      <Card heading="RangeControl">
        <RangeControl value={range} onChange={setRange} />
      </Card>

      <Card heading="Pills and tiles">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={{ key: "action", label: "Text back now", tone: "danger" }} />
          <StatusPill status={{ key: "paused", label: "Paused", tone: "neutral" }} />
          <StatusPill status={{ key: "on_track", label: "On track", tone: "success" }} />
          <SourcePill channel="Facebook" />
          <SourcePill channel="Referral" />
          <SourcePill channel="Podcast" />
          <ChannelTile channel="Facebook" />
          <ChannelTile channel="Instagram" />
          <ChannelTile channel="Google" />
          <ChannelTile channel="TikTok" />
          <ChannelTile channel="Referral" />
          <ChannelTile channel="Unknown" size={36} />
        </div>
      </Card>

      <Card heading="Table (stacked cards on mobile)">
        <Table
          columns={[
            { key: "channel", header: "Channel", render: (row) => (
              <span className="flex items-center gap-2">
                <ChannelTile channel={row.channel} />
                {row.channel}
              </span>
            ) },
            { key: "leads", header: "Leads", align: "right", render: (row) => row.leads.toLocaleString("en-US") },
            { key: "qualified", header: "Qualified", align: "right" },
            { key: "rate", header: "Rate", align: "right" },
            { key: "spend", header: "Spend", align: "right" },
            { key: "perQualified", header: "Per qualified", align: "right" },
          ]}
          rows={CHANNELS}
          rowKey={(row) => row.id}
          onRowClick={() => {}}
          renderCard={(row) => (
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                <ChannelTile channel={row.channel} />
                <span className="text-[13px] font-medium text-ink">{row.channel}</span>
              </span>
              <span className="text-right text-[12px] text-ink-muted">
                {row.rate} · {row.perQualified}
              </span>
            </div>
          )}
        />
      </Card>

      <Card heading="Timeline">
        <Timeline items={ACTIVITY} formatAt={(iso) => iso.slice(11, 16)} />
      </Card>

      <Card heading="QualifiedRadioCards / TimezoneChips">
        <div className="flex flex-col gap-4">
          <QualifiedRadioCards value={milestone} onChange={setMilestone} />
          <TimezoneChips value={timezone} onChange={setTimezone} />
        </div>
      </Card>

      <Card heading="FileChecklist">
        <FileChecklist
          present={["leads.csv", "stage_history.csv", "screener_answers.csv"]}
          statuses={{ "leads.csv": 3530, "stage_history.csv": 9257, "screener_answers.csv": 35300 }}
        />
      </Card>

      <Card heading="UploadProgress / LoadingYourData">
        <div className="flex flex-col gap-5">
          <LoadingYourData progress={{ phase: "importing", pct: 46, rows_done: 24000, rows_total: 52000 }} />
          <LoadingYourData progress={{ phase: "computing", pct: null }} />
        </div>
      </Card>

      <Card heading="ReviewReport">
        <ReviewReport report={uploadOk.report as unknown as Report} agencyName="Harbor Surrogacy" />
      </Card>

      <Card heading="Long labels">
        <div className="grid grid-cols-2 gap-3">
          <KpiCard
            label="Cost per qualified with a very long label that should not break the card"
            value="$145"
            delta={{ text: "+12%", tone: "up" }}
            note="Long note: spend is sample data until ad accounts are connected"
            bar={{ kind: "fill", pct: 55 }}
          />
          <BarRow label={LONG_CHANNEL} value="$1,234.56" pct={88} tone="brand" />
        </div>
      </Card>
    </div>
  )
}

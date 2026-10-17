import { useEffect, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"
import { useSearchParams } from "react-router-dom"
import { useCoordinatorNames } from "@/api/hooks/account"
import { useBoard, useLeadList } from "@/api/hooks/leads"
import { useCurrentSnapshot } from "@/api/hooks/snapshots"
import type { LeadCard as LeadCardData } from "@/api/types"
import { useAuth } from "@/app/auth/useAuth"
import { useLeadPanel } from "@/app/leadPanel"
import { LoadingYourData } from "@/components/shared/LoadingYourData"
import { Button, LinkButton } from "@/components/ui/Button"
import { EmptyState } from "@/components/ui/EmptyState"
import { ErrorState } from "@/components/ui/ErrorState"
import { Input } from "@/components/ui/Input"
import { Pill } from "@/components/ui/Pill"
import { Segmented } from "@/components/ui/Segmented"
import { Select } from "@/components/ui/Select"
import { Skeleton } from "@/components/ui/Skeleton"
import { SourcePill } from "@/components/ui/SourcePill"
import { StatusPill } from "@/components/ui/StatusPill"
import { useIsDesktop } from "@/hooks/useIsDesktop"
import { ColumnChips } from "./components/ColumnChips"
import { LeadCard } from "./components/LeadCard"
import { ageState, stageLabel } from "./lib"

const COLUMNS = [
  { key: "action_needed", label: "Action needed" },
  { key: "in_application", label: "In application" },
  { key: "consult", label: "Consult" },
  { key: "qualified", label: "Qualified" },
] as const

type ColumnKey = (typeof COLUMNS)[number]["key"]

const VIEWS = [
  { value: "board", label: "Board" },
  { value: "list", label: "List" },
] as const
type View = (typeof VIEWS)[number]["value"]

const STATUSES = [
  { value: "open", label: "Open" },
  { value: "all", label: "All" },
  { value: "closed", label: "Closed" },
  { value: "paused", label: "Paused" },
  { value: "accepted", label: "Accepted" },
] as const
type StatusFilter = (typeof STATUSES)[number]["value"]

const isColumn = (value: string | null): value is ColumnKey => COLUMNS.some((column) => column.key === value)
const isStatus = (value: string | null): value is StatusFilter => STATUSES.some((status) => status.value === value)

/** Owner-only filter; a coordinator's data is already scoped server-side, so it is never rendered for them. */
function CoordinatorSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { data } = useCoordinatorNames()
  const options = [{ value: "", label: "All coordinators" }, ...(data?.names ?? []).map((name) => ({ value: name, label: name }))]
  return <Select aria-label="All coordinators" value={value} options={options} onChange={onChange} className="w-[190px]" />
}

function BoardSkeleton({ count }: { count: number }) {
  return (
    <div className={`grid gap-3 ${count === 1 ? "grid-cols-1" : "grid-cols-4"}`}>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex flex-col gap-2 rounded-panel bg-subtle p-2.5">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ))}
    </div>
  )
}

/** One list-view row: name, source/status pills, `age · stage` and the coordinator. Opens the lead panel. */
function ListRow({ lead, onOpen }: { lead: LeadCardData; onOpen: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(lead.id)}
      className="flex w-full min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-row border border-line bg-surface px-3 py-2.5 text-left transition-colors hover:border-line-strong"
    >
      <span className="min-w-0 max-w-full truncate text-[13px] font-semibold text-ink">{lead.name}</span>
      <SourcePill channel={lead.channel} />
      <StatusPill status={lead.status} />
      <span className="text-[12px] text-ink-muted">
        {ageState(lead)} · {stageLabel(lead.stage)}
      </span>
      <span className="ml-auto min-w-0 truncate text-[12px] text-ink-muted">{lead.coordinator ?? "Unassigned"}</span>
    </button>
  )
}

export function PipelinePage() {
  const { role, agency } = useAuth()
  const { open, setIds } = useLeadPanel()
  const isDesktop = useIsDesktop()
  const [params, setParams] = useSearchParams()

  const view: View = params.get("view") === "list" ? "list" : "board"
  const rawStatus = params.get("status")
  const status: StatusFilter = isStatus(rawStatus) ? rawStatus : "open"
  const coordinator = params.get("coordinator") ?? ""
  const q = params.get("q") ?? ""
  // The filter box owns its text between keystrokes; the URL (and so the query key) updates a debounced beat later.
  const [query, setQuery] = useState(q)
  const [syncedQ, setSyncedQ] = useState(q)
  const filterTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // The URL stays the source of truth: reset the box when `q` changes from elsewhere (Back/Forward) using
  // React's "adjust state when a source changes" pattern (a guarded, converging update during render).
  if (q !== syncedQ) {
    setSyncedQ(q)
    setQuery(q)
  }
  // Drop any debounced write still pending when the URL q changes underneath us, or on unmount.
  useEffect(
    () => () => {
      if (filterTimer.current) {
        clearTimeout(filterTimer.current)
        filterTimer.current = null
      }
    },
    [q],
  )
  const rawColumn = params.get("column")
  const column: ColumnKey = isColumn(rawColumn) ? rawColumn : "action_needed"
  const timezone = agency?.timezone ?? "UTC"

  const board = useBoard(coordinator || undefined)
  const list = useLeadList({ status, coordinator: coordinator || undefined, q: q || undefined })

  const { data: snapshot, isLoading: snapshotLoading } = useCurrentSnapshot()
  const pending = snapshot?.pending ?? null
  const hasSnapshot = Boolean(snapshot?.snapshot)

  const boardLeads = useMemo(
    () => (board.data ? COLUMNS.flatMap((definition) => board.data.columns[definition.key].leads) : []),
    [board.data],
  )
  const listLeads = useMemo(() => list.data?.pages.flatMap((page) => page.leads) ?? [], [list.data])
  const visibleLeads = view === "board" ? boardLeads : listLeads
  const visibleIds = useMemo(() => visibleLeads.map((lead) => lead.id), [visibleLeads])

  // The lead panel's Prev/Next cycles the ids currently on screen.
  useEffect(() => {
    setIds(visibleIds)
  }, [setIds, visibleIds])

  const total = board.data ? COLUMNS.reduce((sum, definition) => sum + board.data.columns[definition.key].count, 0) : 0

  const setParam = (key: string, value: string | null) => {
    setParams((previous) => {
      const next = new URLSearchParams(previous)
      if (value) next.set(key, value)
      else next.delete(key)
      return next
    })
  }

  const isEmpty =
    view === "board" ? (board.data ? boardLeads.length === 0 : false) : list.isSuccess && listLeads.length === 0

  // Shared for both views: pending load → loading card, no snapshot → load prompt, otherwise no matches.
  const emptyBlock: ReactNode =
    isEmpty && pending ? (
      <LoadingYourData progress={pending.progress} />
    ) : isEmpty && !hasSnapshot ? (
      role === "owner" ? (
        <EmptyState
          title="No leads yet"
          body="Load your CSV exports to see your pipeline."
          action={
            <LinkButton to="/data" size="sm">
              Load your data
            </LinkButton>
          }
        />
      ) : (
        <EmptyState title="No leads yet" body="Ask your agency owner to load data." />
      )
    ) : isEmpty ? (
      <EmptyState title="No leads match" body="Try another filter or load more of your export." />
    ) : null

  let content: ReactNode
  if (view === "board") {
    if (board.error) {
      content = <ErrorState message="We couldn't load the pipeline." onRetry={() => void board.refetch()} />
    } else if (board.isLoading || snapshotLoading) {
      content = <BoardSkeleton count={isDesktop ? 4 : 1} />
    } else if (emptyBlock) {
      content = emptyBlock
    } else {
      const definitions = isDesktop ? COLUMNS : COLUMNS.filter((definition) => definition.key === column)
      const chips = COLUMNS.map((definition) => ({
        key: definition.key,
        label: definition.label,
        count: board.data?.columns[definition.key].count ?? 0,
      }))
      content = (
        <div className="flex flex-col gap-3">
          {!isDesktop && (
            <ColumnChips
              columns={chips}
              value={column}
              onChange={(next) => setParam("column", next === "action_needed" ? null : next)}
            />
          )}
          <div className={isDesktop ? "grid grid-cols-4 gap-3" : "flex flex-col"}>
            {definitions.map((definition) => {
              const columnData = board.data?.columns[definition.key]
              return (
                <section
                  key={definition.key}
                  aria-label={definition.label}
                  className="flex min-h-[120px] flex-col gap-2 rounded-panel bg-subtle p-2.5"
                >
                  <div className="flex items-center justify-between gap-2 px-1">
                    <h2 className="font-display text-[13px] font-semibold text-ink-secondary">{definition.label}</h2>
                    <span data-testid="column-count">
                      <Pill className="tabular-nums">{columnData?.count ?? 0}</Pill>
                    </span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {columnData?.leads.length ? (
                      columnData.leads.map((lead) => <LeadCard key={lead.id} lead={lead} timezone={timezone} onOpen={open} />)
                    ) : (
                      <p className="px-1 py-2 text-[12px] text-ink-muted">Nothing here</p>
                    )}
                  </div>
                </section>
              )
            })}
          </div>
        </div>
      )
    }
  } else {
    // The toolbar stays mounted while the results swap, so the filter never loses focus mid-type.
    let results: ReactNode
    if (list.error) {
      results = <ErrorState message="We couldn't load the pipeline." onRetry={() => void list.refetch()} />
    } else if (list.isLoading || snapshotLoading) {
      results = <Skeleton className="h-40 w-full" />
    } else if (emptyBlock) {
      results = emptyBlock
    } else {
      results = (
        <>
          <div className="flex flex-col gap-2">
            {listLeads.map((lead) => (
              <ListRow key={lead.id} lead={lead} onOpen={open} />
            ))}
          </div>
          {list.hasNextPage && (
            <Button
              variant="secondary"
              className="self-center"
              pending={list.isFetchingNextPage}
              onClick={() => void list.fetchNextPage()}
            >
              Load more
            </Button>
          )}
        </>
      )
    }
    content = (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            aria-label="Filter leads"
            placeholder="Filter leads"
            value={query}
            onChange={(event) => {
              const value = event.target.value
              setQuery(value)
              // Debounce the URL write so a burst of keystrokes issues one list request, not one per character.
              if (filterTimer.current) clearTimeout(filterTimer.current)
              filterTimer.current = setTimeout(() => {
                setParam("q", value || null)
              }, 300)
            }}
            className="max-w-[260px]"
          />
          <Segmented
            aria-label="Status"
            value={status}
            options={STATUSES.map((option) => ({ value: option.value, label: option.label }))}
            onChange={(next) => setParam("status", next === "open" ? null : next)}
          />
        </div>
        {results}
      </div>
    )
  }

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2 rounded-panel border border-line bg-surface p-1.5">
      <Segmented
        aria-label="View"
        value={view}
        options={VIEWS.map((option) => ({ value: option.value, label: option.label }))}
        onChange={(next) => setParam("view", next === "board" ? null : next)}
      />
      {role === "owner" && <CoordinatorSelect value={coordinator} onChange={(next) => setParam("coordinator", next || null)} />}
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        {isDesktop ? (
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-semibold tracking-[-0.02em] text-ink">Pipeline</h1>
            <Pill className="tabular-nums">{total}</Pill>
          </div>
        ) : (
          <span />
        )}
        {toolbar}
      </header>
      {content}
    </div>
  )
}

import { useCallback, useRef, useState } from "react"
import { useNextActions, useToggleDone } from "@/api/hooks/nextActions"
import { useCurrentSnapshot } from "@/api/hooks/snapshots"
import type { NextActions, QueueKey, Role, TaskItem } from "@/api/types"
import { useAuth } from "@/app/auth/useAuth"
import { useLeadPanel } from "@/app/leadPanel"
import { LinkButton } from "@/components/ui/Button"
import { Chip } from "@/components/ui/Chip"
import { EmptyState } from "@/components/ui/EmptyState"
import { ErrorState } from "@/components/ui/ErrorState"
import { Pill } from "@/components/ui/Pill"
import { SegmentBar } from "@/components/ui/SegmentBar"
import { Skeleton } from "@/components/ui/Skeleton"
import { LoadingYourData } from "@/components/shared/LoadingYourData"
import { useAsyncAction } from "@/hooks/useAsyncAction"
import { useIsDesktop } from "@/hooks/useIsDesktop"
import { formatDate } from "@/lib/format"
import { TaskCard } from "./TaskCard"

/** One queue of `GET /next_actions` (`@/api/types` exports the schema names it was generated from, not `Queue`). */
type Queue = NextActions["queues"][number]

// Queue tone → the colored dot in the well header (design `16`).
const DOT_TONE: Record<Queue["tone"], string> = {
  danger: "bg-danger",
  warning: "bg-warning",
  violet: "bg-violet",
  neutral: "bg-ink-faint",
}

/** One queue well: colored dot, title, open-count pill, hint and its task cards. */
function QueueWell({
  queue,
  onOpen,
  onToggle,
  pendingTaskId,
}: {
  queue: Queue
  onOpen: (leadId: string, tab?: "summary") => void
  onToggle: (item: TaskItem, done: boolean) => void
  pendingTaskId: string | null
}) {
  return (
    <section aria-label={queue.title} className="flex flex-col gap-3 rounded-panel border border-line bg-subtle p-3">
      <div className="flex flex-col gap-1">
        <div className="flex items-start gap-2">
          <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT_TONE[queue.tone]}`} />
          <h2 className="flex-1 text-[14px] font-semibold text-ink">{queue.title}</h2>
          <Pill>{queue.count}</Pill>
        </div>
        <p className="text-[12px] text-ink-muted">{queue.hint}</p>
      </div>

      {queue.items.length === 0 ? (
        <p className="px-1 py-2 text-[13px] text-ink-muted">Nothing here</p>
      ) : (
        <div className="flex flex-col gap-2">
          {queue.items.map((item) => (
            <TaskCard
              key={item.lead_id}
              item={item}
              queue={queue.key}
              onOpen={onOpen}
              onToggle={onToggle}
              pending={pendingTaskId === item.lead_id}
            />
          ))}
        </div>
      )}
    </section>
  )
}

/** Today's progress: `N / M` plus a green bar (handoff §9). */
function ProgressCard({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? (done / total) * 100 : 0
  return (
    <div className="w-full rounded-card border border-line bg-surface p-4 md:w-[240px] md:shrink-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-medium text-ink-secondary">Today&apos;s progress</span>
        <span className="font-display text-[18px] font-semibold text-ink">
          {done} / {total}
        </span>
      </div>
      <div className="mt-2">
        <SegmentBar kind="fill" pct={pct} tone="success" />
      </div>
    </div>
  )
}

/** No snapshot has ever been loaded — owners upload, coordinators ask the owner to. */
function NoDataState({ role }: { role: Role | null }) {
  if (role === "owner") {
    return (
      <EmptyState
        title="Load your data"
        body="Upload your seven CSV exports and today's actions appear here."
        action={
          <LinkButton to="/data" size="sm">
            Load your data
          </LinkButton>
        }
      />
    )
  }
  return <EmptyState title="No data yet" body="Ask your agency owner to load data." />
}

function PageSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-40 w-full" />
        ))}
      </div>
    </div>
  )
}

/**
 * Coordinator home (handoff §9). Queues, counts, header open pill and progress come straight from
 * `GET /next_actions`; Done/Undo is the Wave-0 optimistic `useToggleDone`. Clicking a card (or its
 * contact button) opens the lead panel on Summary.
 */
export function NextActionsPage() {
  const { agency, role } = useAuth()
  const timezone = agency?.timezone ?? "UTC"
  const isDesktop = useIsDesktop()
  const panel = useLeadPanel()
  const nextActions = useNextActions()
  const snapshot = useCurrentSnapshot()
  const { toggle } = useToggleDone()
  const { run: runToggle } = useAsyncAction((leadId: string, queue: QueueKey, done: boolean) => toggle(leadId, queue, done))
  const [activeQueue, setActiveQueue] = useState<QueueKey | null>(null)
  // Only the task whose completion is in flight shows a spinner; the ref is the single-flight guard
  // (a same-tick second click must not clobber the marker of the task already running).
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null)
  const inFlight = useRef<string | null>(null)

  // Declared before the early returns: hooks must run in the same order on every render.
  const toggleTask = useCallback(
    (item: TaskItem, done: boolean, queue: QueueKey) => {
      // Single-flight: one completion at a time for the whole board (non-negotiable 9).
      if (inFlight.current) return
      inFlight.current = item.lead_id
      setPendingTaskId(item.lead_id)
      void runToggle(item.lead_id, queue, done)
        // `useToggleDone` rolls back and toasts on failure; swallow the re-thrown error so a failed
        // completion never becomes an unhandled rejection.
        .catch(() => undefined)
        .finally(() => {
          inFlight.current = null
          setPendingTaskId(null)
        })
    },
    [runToggle],
  )

  if (nextActions.isLoading || snapshot.isLoading) return <PageSkeleton />
  if (nextActions.isError || !nextActions.data) {
    return <ErrorState message="We couldn't load today's actions." onRetry={() => void nextActions.refetch()} />
  }

  const data = nextActions.data
  const pending = snapshot.data?.pending ?? null
  const hasSnapshot = Boolean(snapshot.data?.snapshot)
  const { done, total } = data.progress
  const openCount = total - done
  const caughtUp = total > 0 && done === total
  const onOpen = (leadId: string, tab?: "summary") => panel.open(leadId, tab)

  // Mobile: more than two non-empty queues become chips, one well at a time, defaulting to the
  // first non-empty queue. Desktop always shows the four-column board.
  const nonEmpty = data.queues.filter((queue) => queue.items.length > 0)
  const chips = !isDesktop && nonEmpty.length > 2
  const selected = data.queues.find((queue) => queue.key === activeQueue) ?? nonEmpty[0] ?? data.queues[0]

  const well = (queue: Queue) => (
    <QueueWell
      key={queue.key}
      queue={queue}
      pendingTaskId={pendingTaskId}
      onOpen={onOpen}
      onToggle={(item, done) => toggleTask(item, done, queue.key)}
    />
  )

  const board = (
    <>
      {chips && (
        <div className="flex flex-wrap gap-2">
          {data.queues.map((queue) => (
            <Chip
              key={queue.key}
              selected={selected?.key === queue.key}
              onClick={() => setActiveQueue(queue.key)}
              leading={<span aria-hidden className={`h-2 w-2 rounded-full ${DOT_TONE[queue.tone]}`} />}
            >
              {queue.title} <span className="text-ink-muted">{queue.count}</span>
            </Chip>
          ))}
        </div>
      )}
      <div className={isDesktop ? "grid gap-4 md:grid-cols-4" : "flex flex-col gap-4"}>
        {chips ? well(selected) : data.queues.map(well)}
      </div>
    </>
  )

  let body
  if (total === 0 && pending) body = <LoadingYourData progress={pending.progress} />
  else if (total === 0 && !hasSnapshot) body = <NoDataState role={role} />
  else if (caughtUp) {
    // Everything is done, but a mistaken Done must stay revertible: keep the board (its done cards
    // read Undo) under the banner instead of replacing it.
    body = (
      <>
        <EmptyState
          title="You're all caught up"
          body="Every action for the current snapshot is done. Undo any card below if you marked one by mistake."
        />
        {board}
      </>
    )
  } else {
    body = board
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-[24px] font-semibold tracking-[-0.02em] text-ink">Next actions</h1>
            <Pill>{openCount} open</Pill>
          </div>
          <p className="mt-1 text-[13px] text-ink-muted">{formatDate(data.as_of, timezone, "long")} · most urgent first</p>
        </div>
        <ProgressCard done={done} total={total} />
      </header>

      {body}
    </div>
  )
}

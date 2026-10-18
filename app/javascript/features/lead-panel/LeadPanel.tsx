import { useCallback, useEffect, useId, useRef, useState } from "react"
import type { KeyboardEvent } from "react"
import {
  CalendarCheck,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Mail,
  MapPin,
  Phone,
  User,
  X,
} from "lucide-react"
import { ApiError } from "@/api/client"
import { useLead } from "@/api/hooks/leads"
import { useToggleDone } from "@/api/hooks/nextActions"
import type { LeadDetail } from "@/api/types"
import { useAuth } from "@/app/auth/useAuth"
import { useLeadPanel } from "@/app/leadPanel"
import type { LeadTab } from "@/app/leadPanel"
import { Button } from "@/components/ui/Button"
import { ErrorState } from "@/components/ui/ErrorState"
import { Ring } from "@/components/ui/Ring"
import { Sheet } from "@/components/ui/Sheet"
import { Skeleton } from "@/components/ui/Skeleton"
import { SourcePill } from "@/components/ui/SourcePill"
import { Tabs } from "@/components/ui/Tabs"
import type { TabItem } from "@/components/ui/Tabs"
import { useAsyncAction } from "@/hooks/useAsyncAction"
import { useIsDesktop } from "@/hooks/useIsDesktop"
import { ActivityTab } from "./ActivityTab"
import { ScreenerTab } from "./ScreenerTab"
import { SourceTab } from "./SourceTab"
import { SummaryTab } from "./SummaryTab"

const STAGES: Record<string, string> = {
  inquiry: "Inquiry",
  pre_screen: "Pre-screen",
  application: "Application",
  consult: "Consult",
  records: "Medical records",
  accepted: "Accepted",
}

const CONSULT_STATUS: Record<string, string> = {
  scheduled: "Scheduled",
  attended: "Attended",
  no_show: "No-show",
  cancelled: "Cancelled",
}

const TAB_ITEMS: TabItem<LeadTab>[] = [
  { value: "summary", label: "Summary" },
  { value: "screener", label: "Screener" },
  { value: "activity", label: "Activity" },
  { value: "source", label: "Source" },
]

// Same shape as `components/ui/Button`, for the two actions that must be real links (sms:/tel:).
const LINK_BASE =
  "inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 text-[14px] font-semibold transition-colors md:h-[30px]"
const LINK_OUTLINE = `${LINK_BASE} border border-brand-border text-brand-text hover:bg-brand-tint`
const LINK_SECONDARY = `${LINK_BASE} border border-line bg-surface text-ink hover:bg-subtle`

const stageLabel = (stage: string): string => STAGES[stage] ?? stage

const consultLabel = (consult: LeadDetail["consult"]): string =>
  consult.status ? (CONSULT_STATUS[consult.status] ?? consult.status) : "No consult scheduled"

/** Mounted once per open panel; renders nothing while no lead is selected. */
export function LeadPanelOverlay() {
  const { leadId } = useLeadPanel()
  return leadId ? <LeadPanel /> : null
}

export function LeadPanel() {
  const { leadId, tab, close, open, prev, next, hasPrev, hasNext } = useLeadPanel()
  const { agency } = useAuth()
  const tz = agency?.timezone ?? "UTC"
  const lead = useLead(leadId)
  const detail = lead.data

  const notAvailable = lead.error instanceof ApiError && lead.error.status === 404

  return (
    <Sheet
      open={leadId !== null}
      onClose={close}
      className="pb-[env(safe-area-inset-bottom)]"
      header={
        <PanelHeader
          detail={detail}
          hasPrev={hasPrev}
          hasNext={hasNext}
          onPrev={prev}
          onNext={next}
          onClose={close}
        />
      }
    >
      {lead.isPending ? (
        <PanelSkeleton />
      ) : notAvailable ? (
        <NotAvailable />
      ) : lead.isError ? (
        <ErrorState message="We couldn't load this lead. Try again." onRetry={() => void lead.refetch()} />
      ) : detail ? (
        <LeadPanelBody key={detail.id} detail={detail} tz={tz} tab={tab} onTab={(value) => open(detail.id, value)} />
      ) : null}
    </Sheet>
  )
}

function PanelHeader({
  detail,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  onClose,
}: {
  detail: LeadDetail | undefined
  hasPrev: boolean
  hasNext: boolean
  onPrev: () => void
  onNext: () => void
  onClose: () => void
}) {
  const isDesktop = useIsDesktop()
  const nameId = useId()
  const ref = useRef<HTMLDivElement>(null)

  // `Sheet` only sets `aria-labelledby` when it renders its own `title`, and it takes no aria-* prop, so a
  // custom header leaves `role="dialog"` unnamed. Label the dialog with the visible lead name instead.
  useEffect(() => {
    const dialog = ref.current?.closest('[role="dialog"]')
    if (!dialog) return
    dialog.setAttribute("aria-labelledby", nameId)
    return () => dialog.removeAttribute("aria-labelledby")
  }, [nameId])

  const navButton =
    "inline-flex h-11 min-w-11 items-center justify-center gap-1 rounded-full px-3 text-[13px] font-medium text-ink-secondary transition-colors hover:bg-subtle disabled:pointer-events-none disabled:opacity-40 md:h-8 md:min-w-0"

  return (
    <div ref={ref} className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 py-4">
      <div className="min-w-0">
        <h2 id={nameId} className="truncate font-display text-[17px] font-semibold text-ink">{detail?.name ?? "Lead"}</h2>
        {detail ? (
          <>
            <p className="mt-0.5 flex items-center gap-1 text-[12px] text-ink-muted">
              <User aria-hidden className="h-3.5 w-3.5" />
              {detail.coordinator ?? "Unassigned"}
            </p>
            <p className="mt-0.5 text-[12px] text-ink-secondary">
              {stageLabel(detail.stage)} · {detail.status.label}
            </p>
          </>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button type="button" aria-label="Previous lead" disabled={!hasPrev} onClick={onPrev} className={navButton}>
          <ChevronLeft aria-hidden className="h-4 w-4" />
          {isDesktop ? <span>Prev</span> : null}
        </button>
        <button type="button" aria-label="Next lead" disabled={!hasNext} onClick={onNext} className={navButton}>
          {isDesktop ? <span>Next</span> : null}
          <ChevronRight aria-hidden className="h-4 w-4" />
        </button>
        <button type="button" aria-label="Close lead panel" onClick={onClose} className={navButton}>
          {isDesktop ? <span>Close</span> : null}
          <X aria-hidden className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

function PanelSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end gap-2">
        <Skeleton className="h-[30px] w-24" />
        <Skeleton className="h-[30px] w-16" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  )
}

function NotAvailable() {
  return (
    <div data-testid="lead-not-available" className="flex flex-col items-center gap-2 py-10 text-center">
      <p className="font-display text-[16px] font-semibold text-ink">This lead isn't available</p>
      <p className="text-[13px] text-ink-muted">It may belong to another coordinator or agency, or no longer exist.</p>
    </div>
  )
}

function LeadPanelBody({
  detail,
  tz,
  tab,
  onTab,
}: {
  detail: LeadDetail
  tz: string
  tab: LeadTab
  onTab: (value: LeadTab) => void
}) {
  return (
    <div>
      <ActionRow detail={detail} />
      <TopGrid detail={detail} />
      <div className="mt-4">
        <Tabs value={tab} onChange={onTab} tabs={TAB_ITEMS} aria-label="Lead panel sections" />
      </div>
      <div className="mt-4">
        {tab === "summary" ? <SummaryTab detail={detail} /> : null}
        {tab === "screener" ? <ScreenerTab screener={detail.screener} /> : null}
        {tab === "activity" ? <ActivityTab activity={detail.activity} tz={tz} /> : null}
        {tab === "source" ? <SourceTab source={detail.source} tz={tz} /> : null}
      </div>
    </div>
  )
}

/** Contact actions exist only for the assigned coordinator (`can_contact`); owners get no action row. */
function ActionRow({ detail }: { detail: LeadDetail }) {
  const { can_contact: canContact, phone } = detail.contact
  if (!canContact) return null

  // `can_contact` without a number still cannot be acted on: no empty `sms:`/`tel:` targets.
  const number = phone?.trim() ?? ""
  const canReach = number !== ""
  if (!canReach && !detail.queue) return null

  return (
    <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
      {canReach ? (
        <>
          <a className={LINK_OUTLINE} href={`sms:${number}`}>
            Send text
          </a>
          <a className={LINK_SECONDARY} href={`tel:${number}`}>
            Call
          </a>
        </>
      ) : null}
      {/* Keyed on the server value: a refetch that changes `done` (another session, a new snapshot)
          resets the button to it, while a refetch that agrees with the click leaves the label alone.
          An effect would do the same but trips react-hooks/set-state-in-effect. */}
      {detail.queue ? (
        <DoneButton key={`${detail.id}:${detail.done}`} leadId={detail.id} queue={detail.queue} initialDone={detail.done} />
      ) : null}
      {canReach ? <ActionsMenu number={number} /> : null}
    </div>
  )
}

function DoneButton({ leadId, queue, initialDone }: { leadId: string; queue: NonNullable<LeadDetail["queue"]>; initialDone: boolean }) {
  const { toggle } = useToggleDone()
  const [done, setDone] = useState(initialDone)
  const action = useAsyncAction((next: boolean) => toggle(leadId, queue, next))

  const onClick = () => {
    const next = !done
    setDone(next)
    // Single-flight: `useToggleDone` toasts on failure; roll the label back with it.
    void action.run(next).catch(() => setDone(!next))
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      data-testid="mark-done"
      data-done={done ? "true" : "false"}
      pending={action.pending}
      onClick={onClick}
      leftIcon={done ? <Check aria-hidden className="h-3.5 w-3.5" /> : undefined}
      className={done ? "!border-success !bg-success !text-white hover:!bg-success-text" : ""}
    >
      {done ? "Done" : "Mark done"}
    </Button>
  )
}

function ActionsMenu({ number }: { number: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const itemsRef = useRef<Array<HTMLAnchorElement | null>>([])

  // Escape and item activation return focus to the trigger; an outside click keeps focus where the user clicked.
  const close = useCallback((restoreFocus = false) => {
    setOpen(false)
    if (restoreFocus) triggerRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const el = ref.current
      if (el && event.target instanceof Node && el.contains(event.target)) return
      close()
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [open, close])

  // The trigger keeps focus after the click that opens the menu, so move it onto the first item.
  useEffect(() => {
    if (open) itemsRef.current[0]?.focus()
  }, [open])

  /**
   * The menu owns Escape while it is open: `Sheet` also listens for Escape on `document`, so stopping
   * propagation here (React listens on the portal container, below `document`) is what keeps one Escape
   * from closing the menu *and* the whole panel.
   */
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = itemsRef.current.filter((item): item is HTMLAnchorElement => item !== null)
    if (items.length === 0) return
    if (!["ArrowDown", "ArrowUp", "Home", "End", "Escape"].includes(event.key)) return
    event.preventDefault()

    if (event.key === "Escape") {
      event.stopPropagation()
      close(true)
      return
    }

    const index = items.indexOf(document.activeElement as HTMLAnchorElement)
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : event.key === "ArrowDown"
            ? (index + 1) % items.length
            : (index <= 0 ? items.length : index) - 1
    items[next]?.focus()
  }

  return (
    <div ref={ref} className="relative">
      <Button
        ref={triggerRef}
        variant="secondary"
        size="sm"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        Actions
        <ChevronDown aria-hidden className="h-3.5 w-3.5" />
      </Button>
      {open ? (
        <div
          role="menu"
          onKeyDown={onKeyDown}
          className="absolute right-0 z-10 mt-1 w-40 rounded-row border border-line bg-surface p-1 shadow-modal"
        >
          <a
            ref={(el) => {
              itemsRef.current[0] = el
            }}
            role="menuitem"
            href={`sms:${number}`}
            onClick={() => close(true)}
            className="block rounded-input px-3 py-2 text-[13px] text-ink-secondary hover:bg-subtle"
          >
            Send text
          </a>
          <a
            ref={(el) => {
              itemsRef.current[1] = el
            }}
            role="menuitem"
            href={`tel:${number}`}
            onClick={() => close(true)}
            className="block rounded-input px-3 py-2 text-[13px] text-ink-secondary hover:bg-subtle"
          >
            Call
          </a>
        </div>
      ) : null}
    </div>
  )
}

function TopGrid({ detail }: { detail: LeadDetail }) {
  const { contact, screener, consult } = detail

  return (
    <div data-testid="top-grid" className="grid gap-4 md:grid-cols-3">
      <div data-testid="top-grid-cell" className="flex min-w-0 flex-col gap-2">
        <ul className="flex flex-col gap-1.5 text-[13px] text-ink-secondary">
          <li className="flex items-center gap-2">
            <MapPin aria-hidden className="h-4 w-4 shrink-0 text-ink-faint" />
            {contact.state ?? "—"}
          </li>
          <li className="flex items-center gap-2">
            <Mail aria-hidden className="h-4 w-4 shrink-0 text-ink-faint" />
            {/* `min-w-0` (not just `truncate`) is what lets a long address shrink inside the flex row. */}
            <span className="min-w-0 truncate">{contact.email ?? "—"}</span>
          </li>
          <li className="flex items-center gap-2">
            <Phone aria-hidden className="h-4 w-4 shrink-0 text-ink-faint" />
            {contact.phone ?? "—"}
          </li>
          <li className="flex items-center gap-2">
            <CalendarDays aria-hidden className="h-4 w-4 shrink-0 text-ink-faint" />
            {contact.age === null ? "Age unknown" : `${contact.age} years old`}
          </li>
        </ul>
        <div className="flex items-center gap-1.5">
          <SourcePill channel={contact.channel} />
          {contact.campaign ? <span className="text-[12px] text-ink-muted">· {contact.campaign}</span> : null}
        </div>
      </div>
      <div data-testid="top-grid-cell" className="min-w-0">
        <Ring
          met={screener.counts.met}
          review={screener.counts.review}
          notMet={screener.counts.not_met}
          unanswered={screener.counts.unanswered}
        />
      </div>
      <div data-testid="top-grid-cell" className="flex min-w-0 flex-col items-start gap-2">
        <p className="flex items-center gap-2 text-[13px] font-medium text-ink">
          <CalendarCheck aria-hidden className="h-4 w-4 shrink-0 text-ink-faint" />
          {consultLabel(consult)}
        </p>
        <Button variant="secondary" size="sm" aria-disabled="true" title="Booking integration not connected">
          Book consult
        </Button>
      </div>
    </div>
  )
}

import { useId, useMemo, useState } from "react"
import type { KeyboardEvent } from "react"
import { Search } from "lucide-react"
import { useLeadSearch } from "@/api/hooks/leads"
import type { LeadCard } from "@/api/types"
import { useLeadPanel } from "@/app/leadPanel"
import { useSearchPalette } from "@/app/searchPalette"
import { EmptyState } from "@/components/ui/EmptyState"
import { Input } from "@/components/ui/Input"
import { Modal } from "@/components/ui/Modal"
import { Skeleton } from "@/components/ui/Skeleton"
import { SourcePill } from "@/components/ui/SourcePill"
import { StatusPill } from "@/components/ui/StatusPill"

// The API already caps `q` at 8; slice again so a future backend change can never widen the palette.
const MAX_RESULTS = 8
// The hook only fetches from two characters; below that the palette stays quiet.
const MIN_QUERY = 2

/** Body of the palette. `Modal` renders children only while open, so mounting resets the search. */
function PaletteSearch({ onClose }: { onClose: () => void }) {
  const panel = useLeadPanel()
  const [query, setQuery] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)

  const trimmed = query.trim()
  const ready = trimmed.length >= MIN_QUERY
  const search = useLeadSearch(trimmed)
  const leads = useMemo(() => (search.data?.leads ?? []).slice(0, MAX_RESULTS), [search.data])

  // Results shrink as the query narrows. Deriving the row keeps the highlight valid without an
  // effect: a stale index is clamped instead of triggering a second render.
  const active = leads.length > 0 ? Math.min(activeIndex, leads.length - 1) : -1
  const activeLead = active >= 0 ? leads[active] : null

  const listId = useId()
  const optionId = (lead: LeadCard) => `${listId}-option-${lead.id}`

  const select = (lead: LeadCard) => {
    panel.open(lead.id)
    onClose()
  }

  const move = (delta: 1 | -1) => {
    if (leads.length === 0) return
    setActiveIndex((index) => (Math.min(index, leads.length - 1) + delta + leads.length) % leads.length)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      move(1)
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      move(-1)
    } else if (event.key === "Enter") {
      if (!activeLead) return
      event.preventDefault()
      select(activeLead)
    } else if (event.key === "Escape") {
      // `Modal` also dismisses on Esc; closing twice is a no-op.
      event.preventDefault()
      onClose()
    }
  }

  const searching = ready && (search.isLoading || search.isFetching)

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
        <Input
          autoFocus
          role="combobox"
          aria-label="Search candidates"
          aria-expanded={true}
          aria-controls={leads.length > 0 ? listId : undefined}
          aria-activedescendant={activeLead ? optionId(activeLead) : undefined}
          aria-autocomplete="list"
          placeholder="Search candidates…"
          className="pl-9"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setActiveIndex(0)
          }}
          onKeyDown={onKeyDown}
        />
      </div>

      {!ready ? (
        <p className="px-1 py-3 text-[13px] text-ink-muted">Type at least two characters to search.</p>
      ) : leads.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Search results"
          className="flex max-h-[60vh] flex-col gap-1 overflow-y-auto"
        >
          {leads.map((lead, index) => (
            <li
              key={lead.id}
              id={optionId(lead)}
              role="option"
              aria-selected={index === active}
              onMouseEnter={() => setActiveIndex(index)}
              // Keep focus on the input so `aria-activedescendant` stays meaningful while clicking.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => select(lead)}
              className={`flex cursor-pointer items-center gap-2 rounded-row px-2 py-2 ${
                index === active ? "bg-subtle" : ""
              }`}
            >
              <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-ink">{lead.name}</span>
              <SourcePill channel={lead.channel} />
              <StatusPill status={lead.status} />
            </li>
          ))}
        </ul>
      ) : searching || !search.isSuccess ? (
        <div aria-busy="true" aria-label="Searching" className="flex flex-col gap-2 py-1">
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="h-10 w-full" />
          ))}
        </div>
      ) : (
        <EmptyState className="border-0 bg-transparent py-6" title="No matches" body="Try a first or last name, or an email." />
      )}

      <p className="px-1 text-[11px] text-ink-faint">↑ ↓ to navigate · Enter to open · Esc to close</p>
    </div>
  )
}

/**
 * Cmd/Ctrl+K candidate search (spec decision 10). Renders inside the kit `Modal` — a centered
 * dialog on desktop, a bottom sheet on mobile — and only while `useSearchPalette().isOpen`.
 *
 * The input is an ARIA combobox: focus stays on it and `aria-activedescendant` names the active
 * option, so arrow keys, Enter and Esc all work without moving focus into the list. Selecting an
 * option opens the lead panel and closes the palette, so two overlays never stack.
 */
export function SearchPalette() {
  const { isOpen, close } = useSearchPalette()
  return (
    <Modal open={isOpen} onClose={close} ariaLabel="Search candidates" className="md:mt-[10vh] md:self-start">
      <PaletteSearch onClose={close} />
    </Modal>
  )
}

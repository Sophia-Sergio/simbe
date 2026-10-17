import type { QueueKey, TaskItem } from "@/api/types"
import { Button } from "@/components/ui/Button"

/**
 * One task in a Next-actions queue well (detail reference `2010` Task 2, feature-specific).
 *
 * The contact button follows the handoff (Text, or Call for rebooks) but opens the lead panel on
 * the Summary tab: the API list carries no phone number, so `sms:`/`tel:` links are not possible
 * (lane override 2). Clicking the card body opens the panel too.
 */
export function TaskCard({
  item,
  queue,
  onOpen,
  onToggle,
  pending = false,
}: {
  item: TaskItem
  queue: QueueKey
  onOpen: (leadId: string, tab?: "summary") => void
  onToggle: (item: TaskItem, done: boolean) => void
  pending?: boolean
}) {
  const contactLabel = queue === "rebook_consults" ? "Call" : "Text"
  // Done flips the card to the muted "Undo" state (50% opacity, green pill button).
  const doneClass = item.done ? "border-success-border bg-success-bg text-success-text hover:bg-success-bg" : ""

  return (
    <div
      data-testid="task-card"
      data-done={item.done}
      className={`rounded-row border border-line bg-surface p-3 ${item.done ? "opacity-50" : ""}`}
    >
      <button
        type="button"
        onClick={() => onOpen(item.lead_id)}
        className="flex w-full flex-col gap-1 rounded-input text-left"
      >
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[14px] font-semibold text-ink">{item.name}</span>
          <span className="shrink-0 text-[12px] text-ink-muted">{item.age_label}</span>
        </span>
        <span className="text-[13px] text-ink-secondary">{item.reason}</span>
      </button>

      <div className="mt-3 flex items-center gap-2">
        <Button
          variant="outline-brand"
          size="sm"
          className="h-11 flex-1 md:h-[30px]"
          onClick={() => onOpen(item.lead_id, "summary")}
        >
          {contactLabel}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className={`h-11 flex-1 md:h-[30px] ${doneClass}`}
          pending={pending}
          onClick={() => onToggle(item, !item.done)}
        >
          {item.done ? "Undo" : "Done"}
        </Button>
      </div>
    </div>
  )
}

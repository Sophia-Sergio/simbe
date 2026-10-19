import type { LeadDetail } from "@/api/types"
import { useLeadPanel } from "@/app/leadPanel"
import { formatDate } from "@/lib/format"

/**
 * The person's other inquiries. A lead is one inquiry and the same person can inquire again, so a lead
 * can have siblings; an owner sees all of them, a coordinator only their own. `open_overlap` is shown
 * even when the list is empty (a coordinator may be allowed to see none of the others).
 */
export function InquiriesCard({ detail, tz }: { detail: LeadDetail; tz: string }) {
  const { open } = useLeadPanel()
  const others = detail.other_inquiries
  if (others.length === 0 && !detail.open_overlap) return null

  return (
    <section data-testid="inquiries" className="rounded-card border border-line p-4">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">This person's other inquiries</h3>
      {others.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1">
          {others.map((inquiry) => (
            <li key={inquiry.id}>
              <button
                type="button"
                onClick={() => open(inquiry.id, "summary")}
                className="flex min-h-11 w-full flex-col items-start justify-center gap-0.5 rounded-card px-2 py-1.5 text-left transition-colors hover:bg-subtle"
              >
                <span className="text-[13px] font-medium text-ink">
                  {formatDate(inquiry.created_at, tz, "short")} · {inquiry.status.label}
                </span>
                <span className="text-[12px] text-ink-muted">
                  {inquiry.channel} · {inquiry.coordinator ?? "Unassigned"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {detail.open_overlap ? (
        <p className="mt-3 text-[12px] text-warning-text">Another inquiry from this person was still open</p>
      ) : null}
    </section>
  )
}

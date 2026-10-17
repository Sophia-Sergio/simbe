import type { LeadDetail } from "@/api/types"
import { StatusPill } from "@/components/ui/StatusPill"
import type { PillTone } from "@/components/ui/Pill"

type Screener = LeadDetail["screener"]
type Verdict = Screener["items"][number]["verdict"]

const VERDICTS: Record<Verdict, { label: string; tone: PillTone }> = {
  met: { label: "Met", tone: "success" },
  review: { label: "Review", tone: "warning" },
  not_met: { label: "Not met", tone: "danger" },
  unanswered: { label: "Unanswered", tone: "neutral" },
}

const COORDINATOR_NOTE = "Health answers are visible to the assigned coordinator only."

export function ScreenerTab({ screener }: { screener: Screener }) {
  return (
    <section>
      {screener.items.length === 0 ? (
        <p className="text-[13px] text-ink-muted">No screener answers on record.</p>
      ) : (
        <ul className="divide-y divide-line-subtle">
          {screener.items.map((item) => (
            <li
              key={item.question}
              data-testid="screener-item"
              className="flex items-start justify-between gap-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-[13px] text-ink">{item.question}</p>
                {/* Raw answers arrive only for the assigned coordinator: never inferred, never shown without them. */}
                {item.answer === undefined ? null : (
                  <p data-testid="raw-answer" className="mt-0.5 text-[12px] text-ink-muted">
                    {item.answer}
                  </p>
                )}
              </div>
              <StatusPill status={{ key: item.verdict, label: VERDICTS[item.verdict].label, tone: VERDICTS[item.verdict].tone }} />
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-[12px] text-ink-muted">{COORDINATOR_NOTE}</p>
    </section>
  )
}

import { Check, Sparkles } from "lucide-react"
import type { LeadDetail } from "@/api/types"

type ProcessStep = LeadDetail["process"][number]

const STATE_LABELS: Record<ProcessStep["state"], string> = {
  complete: "Complete",
  ongoing: "Ongoing",
  stopped: "Stopped",
  upcoming: "Upcoming",
}

/** State icon: green ✓ complete, brand ring ongoing, red ring stopped, grey ring upcoming. */
function ProcessIcon({ state }: { state: ProcessStep["state"] }) {
  if (state === "complete") {
    return (
      <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-success">
        <Check aria-hidden className="h-3 w-3 text-white" />
      </span>
    )
  }
  const ring = state === "ongoing" ? "border-brand" : state === "stopped" ? "border-danger" : "border-line-strong"
  return <span aria-hidden className={`h-4 w-4 shrink-0 rounded-full border-2 ${ring}`} />
}

export function SummaryTab({ detail }: { detail: LeadDetail }) {
  return (
    <div className="flex flex-col gap-3">
      <section data-testid="process" className="rounded-card border border-line p-4">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Process</h3>
        <ul className="mt-3 flex flex-col gap-2.5">
          {detail.process.map((step) => (
            <li key={step.key} className="flex items-center gap-2 text-[13px]">
              <ProcessIcon state={step.state} />
              <span className="font-medium text-ink">{step.label}</span>
              <span className="text-ink-faint">·</span>
              <span className="text-ink-muted">{STATE_LABELS[step.state]}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="rounded-card border border-line bg-app p-4">
        <p className="flex items-center gap-2 text-[13px] font-semibold text-ink">
          <Sparkles aria-hidden className="h-4 w-4 text-brand" />
          Simbe summary
        </p>
        <p className="mt-2 text-[13px] text-ink-secondary">{detail.summary.text}</p>
        <p className="mt-2 text-[13px] text-ink-secondary">
          <span className="font-medium text-ink">Suggested next step: </span>
          {detail.summary.next_step}
        </p>
      </section>
    </div>
  )
}

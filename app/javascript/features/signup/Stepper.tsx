import { Check } from "lucide-react"

const WIZARD_STEPS = ["Account", "Agency", "Ad accounts", "Load data", "Team"] as const

export type StepStatus = "done" | "current" | "upcoming"

function statusOf(step: number, index: number): StepStatus {
  const number = index + 1
  if (number < step) return "done"
  if (number === step) return "current"
  return "upcoming"
}

const DOT: Record<StepStatus, string> = {
  done: "bg-success text-white",
  current: "bg-brand text-white",
  upcoming: "border border-line bg-surface text-ink-muted",
}

/** The wizard's header strip: five numbered dots with labels (labels collapse to "Step N of 5" on mobile). */
export function Stepper({ step }: { step: number }) {
  return (
    <div className="border-b border-line bg-app px-4 py-3">
      <ol aria-label="Sign-up progress" className="flex items-center justify-center gap-3 md:gap-5">
        {WIZARD_STEPS.map((label, index) => {
          const status = statusOf(step, index)
          return (
            <li key={label} className="flex items-center gap-2" aria-current={status === "current" ? "step" : undefined}>
              <span
                data-status={status}
                aria-label={`${label}: ${status}`}
                className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[12px] font-semibold ${DOT[status]}`}
              >
                {status === "done" ? <Check aria-hidden className="h-3 w-3" /> : index + 1}
              </span>
              <span className={`hidden text-[13px] md:inline ${status === "current" ? "font-semibold text-ink" : "text-ink-muted"}`}>
                {label}
              </span>
            </li>
          )
        })}
      </ol>
      <p className="mt-1 text-center text-[13px] font-medium text-ink-muted md:hidden">
        Step {step} of {WIZARD_STEPS.length}
      </p>
    </div>
  )
}

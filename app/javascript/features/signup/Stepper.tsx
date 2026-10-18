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

/**
 * The wizard's header strip: five numbered dots with labels (labels collapse to dots on mobile).
 * With `onGo`, every step from `firstReachable` on (except the current one) is a button; the steps
 * before it stay plain (steps 1–2 must never be revisited once the account exists).
 */
export function Stepper({ step, firstReachable, onGo }: { step: number; firstReachable?: number; onGo?: (step: number) => void }) {
  return (
    <div className="border-b border-line bg-app px-4 py-3">
      <ol aria-label="Sign-up progress" className="flex items-center justify-center gap-3 md:gap-5">
        {WIZARD_STEPS.map((label, index) => {
          const status = statusOf(step, index)
          const goable = onGo !== undefined && firstReachable !== undefined && index + 1 >= firstReachable && status !== "current"
          const content = (
            <>
              {/* The name lives on the item, so the dot-only mobile row still announces label + status. */}
              <span className="sr-only">{`${label}: ${status}`}</span>
              <span
                data-status={status}
                aria-hidden="true"
                className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[12px] font-semibold ${DOT[status]}`}
              >
                {status === "done" ? <Check aria-hidden className="h-3 w-3" /> : index + 1}
              </span>
              <span
                aria-hidden="true"
                className={`hidden text-[13px] md:inline ${status === "current" ? "font-semibold text-ink" : "text-ink-muted"}`}
              >
                {label}
              </span>
            </>
          )
          return (
            <li key={label} aria-current={status === "current" ? "step" : undefined}>
              {goable ? (
                <button type="button" onClick={() => onGo(index + 1)} className="flex min-h-11 items-center gap-2 rounded-full px-1">
                  {content}
                </button>
              ) : (
                <span className="flex items-center gap-2">{content}</span>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

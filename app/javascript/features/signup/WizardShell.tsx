import { useEffect, useRef } from "react"
import type { ReactNode } from "react"
import { Link } from "react-router-dom"
import { BrandMark } from "@/components/ui/BrandMark"
import { Stepper } from "./Stepper"

/**
 * The sign-up card: a public page (no app shell), centered at max 600px, with the mark above the
 * stepper, a `28px 24px` body and a footer bar that sticks to the bottom on mobile.
 *
 * Moving forward focuses the step heading so the new step is announced; so does any move among the
 * authenticated steps (3–4), whose Back button vanishes with the step. Moving back to step 1–2 (a
 * rejected submit) leaves focus alone, so the step can put it on the field that needs fixing.
 */
export function WizardShell({
  step,
  title,
  subtitle,
  alert,
  children,
  footer,
  firstReachable,
  onGo,
}: {
  step: number
  title: string
  subtitle: string
  alert?: string | null
  children: ReactNode
  footer: ReactNode
  firstReachable?: number
  onGo?: (step: number) => void
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  const previousStep = useRef(step)

  useEffect(() => {
    if (step !== previousStep.current && (step > previousStep.current || step >= 3)) heading.current?.focus()
    previousStep.current = step
  }, [step])

  return (
    <div className="flex min-h-screen flex-col bg-app">
      <header className="flex items-center justify-between border-b border-line bg-surface px-4 py-3">
        <span className="flex items-center gap-2">
          <BrandMark size={28} />
          <span className="font-display text-[18px] font-semibold text-ink">Simbe</span>
        </span>
        <Link to="/signin" className="inline-flex min-h-11 items-center text-[13px] font-semibold text-brand-text">
          Sign in instead
        </Link>
      </header>

      <div className="flex flex-1 justify-center px-0 py-6 md:px-4 md:py-12">
        <div className="w-full max-w-[600px] self-start">
          <div className="mb-4 flex justify-center">
            <BrandMark size={40} />
          </div>
          <div className="rounded-none border-y border-line bg-surface shadow-modal md:rounded-modal md:border">
            <Stepper step={step} firstReachable={firstReachable} onGo={onGo} />
            <div className="px-6 py-7">
              <h1 ref={heading} tabIndex={-1} className="font-display text-[21px] font-semibold text-ink focus:outline-none">
                {title}
              </h1>
              <p className="mt-1 text-[14px] text-ink-muted">{subtitle}</p>
              {alert ? (
                <p role="alert" className="mt-3 rounded-input border border-danger-border bg-danger-bg px-3 py-2 text-[13px] font-medium text-danger-text">
                  {alert}
                </p>
              ) : null}
              <div className="mt-5">{children}</div>
            </div>
            <footer className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-line bg-surface px-6 py-4 md:static">
              {footer}
            </footer>
          </div>
        </div>
      </div>
    </div>
  )
}

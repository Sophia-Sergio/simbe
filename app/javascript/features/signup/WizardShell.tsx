import type { ReactNode } from "react"
import { Link } from "react-router-dom"
import { BrandMark } from "@/components/ui/BrandMark"
import { Stepper } from "./Stepper"

/**
 * The sign-up card: a public page (no app shell), centered at max 600px, with the mark above the
 * stepper, a `28px 24px` body and a footer bar that sticks to the bottom on mobile.
 */
export function WizardShell({
  step,
  title,
  subtitle,
  children,
  footer,
}: {
  step: number
  title: string
  subtitle: string
  children: ReactNode
  footer: ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col bg-app">
      <header className="flex items-center justify-between border-b border-line bg-surface px-4 py-3">
        <span className="flex items-center gap-2">
          <BrandMark size={28} />
          <span className="font-display text-[18px] font-semibold text-ink">Simbe</span>
        </span>
        <Link to="/signin" className="text-[13px] font-semibold text-brand-text">
          Sign in instead
        </Link>
      </header>

      <div className="flex flex-1 justify-center px-0 py-6 md:px-4 md:py-12">
        <div className="w-full max-w-[600px] self-start">
          <div className="mb-4 flex justify-center">
            <BrandMark size={40} />
          </div>
          <div className="rounded-none border-y border-line bg-surface shadow-modal md:rounded-modal md:border">
            <Stepper step={step} />
            <div className="px-6 py-7">
              <h1 className="font-display text-[21px] font-semibold text-ink">{title}</h1>
              <p className="mt-1 text-[14px] text-ink-muted">{subtitle}</p>
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

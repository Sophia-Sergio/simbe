import { useState } from "react"
import type { ReactNode } from "react"
import { useUpdateAgency } from "@/api/hooks/account"
import type { Agency } from "@/api/types"
import { useAuth } from "@/app/auth/useAuth"
import { QualifiedRadioCards } from "@/components/shared/QualifiedRadioCards"
import { TimezoneChips } from "@/components/shared/TimezoneChips"
import { Skeleton } from "@/components/ui/Skeleton"
import { useToast } from "@/components/ui/Toast"
import { useAsyncAction } from "@/hooks/useAsyncAction"
import { TeamCard } from "./TeamCard"

const DEFINITION_SAVED = "Saved. Every number now uses this definition."
const TIMEZONE_SAVED = "Saved. Times now use this time zone."
const SAVE_FAILED = "We could not save that. Try again."

function Section({
  id,
  title,
  subtitle,
  children,
}: {
  id: string
  title: string
  subtitle: string
  children: ReactNode
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3 rounded-card border border-line bg-surface p-5">
      <div>
        <h2 id={id} className="font-display text-[16px] font-semibold text-ink">
          {title}
        </h2>
        <p className="mt-0.5 text-[13px] text-ink-muted">{subtitle}</p>
      </div>
      {children}
    </section>
  )
}

/**
 * Owner-only settings: definition of "qualified", time zone and the team. Both definition cards save
 * immediately (`useUpdateAgency`) and toast; the agency copy in `["me"]` is updated optimistically, so the
 * selected card is right while the request is in flight and rolls back if it fails.
 */
export function SettingsPage() {
  const { agency } = useAuth()
  const update = useUpdateAgency()
  const toast = useToast()
  const [error, setError] = useState<string | null>(null)

  const persist = async (body: Partial<Agency>): Promise<boolean> => {
    setError(null)
    try {
      await update.mutateAsync(body)
      return true
    } catch {
      setError(SAVE_FAILED)
      return false
    }
  }

  const definition = useAsyncAction(async (milestone: Agency["qualified_milestone"]) => {
    if (await persist({ qualified_milestone: milestone })) toast.show(DEFINITION_SAVED, { tone: "success" })
  })
  const timezone = useAsyncAction(async (value: string) => {
    if (await persist({ timezone: value })) toast.show(TIMEZONE_SAVED, { tone: "success" })
  })

  const header = (
    <header>
      <h1 className="hidden font-display text-[24px] font-semibold tracking-[-0.02em] text-ink md:block">Settings</h1>
    </header>
  )

  const failed = error && (
    <p role="alert" className="text-[13px] font-medium text-danger-text">
      {error}
    </p>
  )

  if (!agency) {
    return (
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5">
        {header}
        <Skeleton className="h-[360px]" />
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4">
      {header}
      <Section id="qualified-heading" title="Definition of qualified" subtitle="Changing this updates every number right away.">
        <QualifiedRadioCards
          value={agency.qualified_milestone}
          disabled={definition.pending}
          onChange={(milestone) => void definition.run(milestone)}
        />
        {failed}
      </Section>

      <Section id="timezone-heading" title="Time zone" subtitle="Every date and time in Simbe uses this zone.">
        <TimezoneChips value={agency.timezone} onChange={(value) => void timezone.run(value)} />
      </Section>

      <TeamCard />
    </div>
  )
}

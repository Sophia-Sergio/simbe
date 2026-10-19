import { useState } from "react"
import type { ReactNode } from "react"
import { useUpdateAgency } from "@/api/hooks/account"
import type { Agency } from "@/api/types"
import { useAuth } from "@/app/auth/useAuth"
import { TIMEZONES } from "@/components/shared/options"
import { QualifiedRadioCards } from "@/components/shared/QualifiedRadioCards"
import { TimezoneChips } from "@/components/shared/TimezoneChips"
import { Chip } from "@/components/ui/Chip"
import { Skeleton } from "@/components/ui/Skeleton"
import { useToast } from "@/components/ui/Toast"
import { useAsyncAction } from "@/hooks/useAsyncAction"
import { TeamCard } from "./TeamCard"

const DEFINITION_SAVED = "Saved. Every number now uses this definition."
const TIMEZONE_SAVED = "Saved. Times now use this time zone."
const SAVE_FAILED = "We could not save that. Try again."
const DEFINITION_NOTICE = "Your funnel and channels all recompute from this definition."

/** The kit's chips only know the four offered zones: a stored zone outside them would render unselected. */
function ZoneChips({ value, onChange }: { value: string; onChange: (timezone: string) => void }) {
  if (TIMEZONES.some((zone) => zone.value === value)) return <TimezoneChips value={value} onChange={onChange} />
  const zones: { label: string; value: string }[] = [...TIMEZONES, { label: value, value }]
  return (
    <div role="group" aria-label="Time zone" className="flex flex-wrap gap-2">
      {zones.map((zone) => (
        <Chip key={zone.value} selected={zone.value === value} onClick={() => onChange(zone.value)}>
          {zone.label}
        </Chip>
      ))}
    </div>
  )
}

function Section({
  id,
  title,
  subtitle,
  error,
  children,
}: {
  id: string
  title: string
  subtitle: string
  error?: string | null
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
      {error && (
        <p role="alert" className="text-[13px] font-medium text-danger-text">
          {error}
        </p>
      )}
    </section>
  )
}

/**
 * Owner-only settings: definition of "qualified", time zone and the team. Both definition cards save
 * immediately (`useUpdateAgency`) and toast; the agency copy in `["me"]` is updated optimistically, so the
 * selected card is right while the request is in flight and rolls back if it fails. A failure is reported
 * inside the card it belongs to, so it is never mistaken for the other card's save.
 */
export function SettingsPage() {
  const { agency } = useAuth()
  const update = useUpdateAgency()
  const toast = useToast()
  const [definitionError, setDefinitionError] = useState<string | null>(null)
  const [timezoneError, setTimezoneError] = useState<string | null>(null)

  const persist = async (body: Partial<Agency>, report: (message: string | null) => void): Promise<boolean> => {
    report(null)
    try {
      await update.mutateAsync(body)
      return true
    } catch {
      report(SAVE_FAILED)
      return false
    }
  }

  const definition = useAsyncAction(async (milestone: Agency["qualified_milestone"]) => {
    if (await persist({ qualified_milestone: milestone }, setDefinitionError)) toast.show(DEFINITION_SAVED, { tone: "success" })
  })
  const timezone = useAsyncAction(async (value: string) => {
    if (await persist({ timezone: value }, setTimezoneError)) toast.show(TIMEZONE_SAVED, { tone: "success" })
  })

  const header = (
    <header>
      <h1 className="hidden font-display text-[24px] font-semibold tracking-[-0.02em] text-ink md:block">Settings</h1>
    </header>
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
      <Section
        id="qualified-heading"
        title="Definition of qualified"
        subtitle="Changing this updates every number right away."
        error={definitionError}
      >
        <QualifiedRadioCards
          value={agency.qualified_milestone}
          disabled={definition.pending}
          onChange={(milestone) => void definition.run(milestone)}
        />
        {/* Says what is about to change, before the save fires. */}
        <p className="text-[13px] text-ink-muted">{DEFINITION_NOTICE}</p>
      </Section>

      <Section
        id="timezone-heading"
        title="Time zone"
        subtitle="Every date and time in Simbe uses this zone."
        error={timezoneError}
      >
        <ZoneChips value={agency.timezone} onChange={(value) => void timezone.run(value)} />
      </Section>

      <TeamCard />
    </div>
  )
}

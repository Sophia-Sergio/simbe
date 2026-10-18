import { QualifiedRadioCards } from "@/components/shared/QualifiedRadioCards"
import { TimezoneChips } from "@/components/shared/TimezoneChips"
import { Field } from "@/components/ui/Field"
import { Input } from "@/components/ui/Input"
import type { AgencyDraft } from "../SignUpPage"

/** An error under an input that is not a `Field` (the chips and cards); same look as `Field`'s error line. */
function InputError({ children }: { children: string }) {
  return (
    <p role="alert" className="text-[12px] font-medium text-danger-text">
      {children}
    </p>
  )
}

/** Step 2: agency name, time zone and the "qualified" definition (recommended option preselected). */
export function AgencyStep({
  value,
  onChange,
  onBlur,
  error,
  timezoneError,
  milestoneError,
}: {
  value: AgencyDraft
  onChange: (patch: Partial<AgencyDraft>) => void
  onBlur?: () => void
  error?: string | null
  timezoneError?: string
  milestoneError?: string
}) {
  return (
    <div className="flex flex-col gap-5">
      <Field label="Agency name" error={error ?? undefined}>
        <Input
          autoComplete="organization"
          value={value.name}
          onChange={(event) => onChange({ name: event.target.value })}
          onBlur={onBlur}
        />
      </Field>

      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-medium text-ink-secondary">Time zone</span>
        <TimezoneChips value={value.timezone} onChange={(timezone) => onChange({ timezone })} />
        {timezoneError ? <InputError>{timezoneError}</InputError> : null}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-medium text-ink-secondary">A qualified surrogate is a lead who has…</span>
        <QualifiedRadioCards value={value.milestone} onChange={(milestone) => onChange({ milestone })} />
        {milestoneError ? <InputError>{milestoneError}</InputError> : null}
      </div>
    </div>
  )
}

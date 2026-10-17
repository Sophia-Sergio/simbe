import { QualifiedRadioCards } from "@/components/shared/QualifiedRadioCards"
import { TimezoneChips } from "@/components/shared/TimezoneChips"
import { Field } from "@/components/ui/Field"
import { Input } from "@/components/ui/Input"
import type { AgencyDraft } from "../SignUpPage"

/** Step 2: agency name, time zone and the "qualified" definition (recommended option preselected). */
export function AgencyStep({
  value,
  onChange,
  onBlur,
  error,
}: {
  value: AgencyDraft
  onChange: (patch: Partial<AgencyDraft>) => void
  onBlur?: () => void
  error?: string | null
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
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-medium text-ink-secondary">A qualified surrogate is a lead who has…</span>
        <QualifiedRadioCards value={value.milestone} onChange={(milestone) => onChange({ milestone })} />
      </div>
    </div>
  )
}

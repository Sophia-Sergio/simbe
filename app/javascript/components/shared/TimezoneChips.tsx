import { Chip } from "@/components/ui/Chip"
import { TIMEZONES } from "./options"

/** Agency time-zone chips (sign-up + settings). */
export function TimezoneChips({ value, onChange }: { value: string; onChange: (timezone: string) => void }) {
  return (
    <div role="group" aria-label="Time zone" className="flex flex-wrap gap-2">
      {TIMEZONES.map((timezone) => (
        <Chip key={timezone.value} selected={timezone.value === value} onClick={() => onChange(timezone.value)}>
          {timezone.label}
        </Chip>
      ))}
    </div>
  )
}

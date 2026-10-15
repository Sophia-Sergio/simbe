import { Pill } from "@/components/ui/Pill"
import { QUALIFIED_OPTIONS } from "./options"
import type { Milestone } from "./options"

/** Radio cards for the agency's "qualified" definition (sign-up + settings). */
export function QualifiedRadioCards({
  value,
  onChange,
  disabled = false,
}: {
  value: Milestone
  onChange: (milestone: Milestone) => void
  disabled?: boolean
}) {
  return (
    <div role="radiogroup" aria-label="Definition of qualified" className="flex flex-col gap-2">
      {QUALIFIED_OPTIONS.map((option) => {
        const selected = option.value === value
        return (
          <label
            key={option.value}
            className={`flex cursor-pointer items-start gap-3 rounded-card border p-3 transition-colors ${
              selected ? "border-brand-border bg-brand-tint" : "border-line bg-surface hover:bg-subtle"
            } ${disabled ? "pointer-events-none opacity-50" : ""}`}
          >
            <input
              type="radio"
              name="qualified-milestone"
              value={option.value}
              checked={selected}
              disabled={disabled}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            <span
              data-testid="radio-mark"
              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                selected ? "border-brand ring-[5px] ring-brand/20" : "border-line-strong"
              }`}
            >
              {selected ? <span className="h-2 w-2 rounded-full bg-brand" /> : null}
            </span>
            <span className="flex flex-1 flex-col gap-1">
              <span className="text-[13px] font-medium text-ink">{option.title}</span>
              <span className="text-[12px] text-ink-muted">{option.description}</span>
              {option.recommended ? (
                <span className="mt-0.5">
                  <Pill tone="brand">Recommended</Pill>
                </span>
              ) : null}
            </span>
          </label>
        )
      })}
    </div>
  )
}

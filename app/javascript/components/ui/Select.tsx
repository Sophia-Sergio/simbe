import { ChevronDown } from "lucide-react"
import { useField } from "./Field"

export type SelectOption = { value: string; label: string }

export function Select({
  options,
  value,
  onChange,
  id,
  invalid,
  disabled,
  placeholder,
  className = "",
  "aria-label": ariaLabel,
}: {
  options: SelectOption[]
  value: string
  onChange?: (value: string) => void
  id?: string
  invalid?: boolean
  disabled?: boolean
  placeholder?: string
  className?: string
  "aria-label"?: string
}) {
  const field = useField()
  const resolvedId = id ?? field?.id
  const isInvalid = invalid ?? field?.invalid ?? false

  return (
    <div className="relative">
      <select
        id={resolvedId}
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-invalid={isInvalid ? true : undefined}
        aria-describedby={field?.describedBy}
        onChange={(event) => onChange?.(event.target.value)}
        className={`h-10 w-full appearance-none rounded-input border border-line bg-surface pl-3 pr-9 text-[14px] text-ink disabled:bg-subtle disabled:text-ink-muted ${
          isInvalid ? "border-danger" : ""
        } ${className}`}
      >
        {placeholder !== undefined && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
    </div>
  )
}

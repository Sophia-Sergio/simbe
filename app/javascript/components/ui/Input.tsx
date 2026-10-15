import { forwardRef } from "react"
import type { InputHTMLAttributes } from "react"
import { useField } from "./Field"

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid, className = "", id, "aria-describedby": describedBy, ...rest },
  ref,
) {
  const field = useField()
  const resolvedId = id ?? field?.id
  const isInvalid = invalid ?? field?.invalid ?? false
  const ariaDescribedBy = describedBy ?? field?.describedBy

  return (
    <input
      ref={ref}
      id={resolvedId}
      aria-invalid={isInvalid ? true : undefined}
      aria-describedby={ariaDescribedBy}
      className={`h-10 w-full rounded-input border border-line bg-surface px-3 text-[14px] text-ink placeholder:text-ink-faint disabled:bg-subtle disabled:text-ink-muted ${
        isInvalid ? "border-danger" : ""
      } ${className}`}
      {...rest}
    />
  )
})

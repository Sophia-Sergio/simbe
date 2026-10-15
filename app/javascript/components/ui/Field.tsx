import { createContext, useContext, useId } from "react"
import type { ReactNode } from "react"

type FieldContextValue = {
  id: string
  invalid: boolean
  describedBy?: string
}

const FieldContext = createContext<FieldContextValue | null>(null)

/** Lets a connected `Input`/`Select` pick up the label, error and hint ids from the surrounding `Field`. */
export function useField(): FieldContextValue | null {
  return useContext(FieldContext)
}

export function Field({
  label,
  error,
  hint,
  htmlFor,
  className = "",
  children,
}: {
  label: string
  error?: string
  hint?: string
  htmlFor?: string
  className?: string
  children: ReactNode
}) {
  const autoId = useId()
  const id = htmlFor ?? autoId
  const errorId = `${id}-error`
  const hintId = `${id}-hint`
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined

  return (
    <FieldContext.Provider value={{ id, invalid: Boolean(error), describedBy }}>
      <div className={`flex flex-col gap-1 ${className}`}>
        <label htmlFor={id} className="text-[13px] font-medium text-ink-secondary">
          {label}
        </label>
        {children}
        {hint && (
          <p id={hintId} className="text-[12px] text-ink-muted">
            {hint}
          </p>
        )}
        {error && (
          <p id={errorId} role="alert" className="text-[12px] font-medium text-danger-text">
            {error}
          </p>
        )}
      </div>
    </FieldContext.Provider>
  )
}

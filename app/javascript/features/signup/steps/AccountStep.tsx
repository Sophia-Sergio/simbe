import { useEffect, useRef } from "react"
import { Field } from "@/components/ui/Field"
import { Input } from "@/components/ui/Input"
import type { AccountDraft, AccountField, FieldErrors } from "../SignUpPage"

/** Step 1: the owner's name, work email and password. Passwords are never persisted client-side. */
export function AccountStep({
  value,
  onChange,
  onBlur,
  errors,
  focusRequest,
}: {
  value: AccountDraft
  onChange: (patch: Partial<AccountDraft>) => void
  onBlur: (field: AccountField) => void
  errors: FieldErrors
  /** Set by a rejected submit: the field the user has to fix. */
  focusRequest?: { field: AccountField } | null
}) {
  const name = useRef<HTMLInputElement>(null)
  const email = useRef<HTMLInputElement>(null)
  const password = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const target =
      focusRequest?.field === "name" ? name : focusRequest?.field === "email" ? email : focusRequest?.field === "password" ? password : null
    target?.current?.focus()
  }, [focusRequest])

  return (
    <div className="flex flex-col gap-4">
      <Field label="Your name" error={errors.name}>
        <Input
          ref={name}
          autoComplete="name"
          value={value.name}
          onChange={(event) => onChange({ name: event.target.value })}
          onBlur={() => onBlur("name")}
        />
      </Field>
      <Field label="Work email" error={errors.email}>
        <Input
          ref={email}
          type="email"
          autoComplete="email"
          value={value.email}
          onChange={(event) => onChange({ email: event.target.value })}
          onBlur={() => onBlur("email")}
        />
      </Field>
      <Field label="Password" hint="At least 10 characters" error={errors.password}>
        <Input
          ref={password}
          type="password"
          autoComplete="new-password"
          value={value.password}
          onChange={(event) => onChange({ password: event.target.value })}
          onBlur={() => onBlur("password")}
        />
      </Field>
    </div>
  )
}

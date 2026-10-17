import { Field } from "@/components/ui/Field"
import { Input } from "@/components/ui/Input"
import type { AccountDraft, FieldErrors } from "../SignUpPage"

/** Step 1: the owner's name, work email and password. Passwords are never persisted client-side. */
export function AccountStep({
  value,
  onChange,
  errors,
}: {
  value: AccountDraft
  onChange: (patch: Partial<AccountDraft>) => void
  errors: FieldErrors
}) {
  return (
    <div className="flex flex-col gap-4">
      <Field label="Your name">
        <Input autoComplete="name" value={value.name} onChange={(event) => onChange({ name: event.target.value })} />
      </Field>
      <Field label="Work email" error={errors.email}>
        <Input type="email" autoComplete="email" value={value.email} onChange={(event) => onChange({ email: event.target.value })} />
      </Field>
      <Field label="Password" hint="At least 10 characters" error={errors.password}>
        <Input
          type="password"
          autoComplete="new-password"
          value={value.password}
          onChange={(event) => onChange({ password: event.target.value })}
        />
      </Field>
    </div>
  )
}

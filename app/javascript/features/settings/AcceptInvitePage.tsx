import { useRef, useState } from "react"
import type { ReactNode } from "react"
import { useParams } from "react-router-dom"
import { ApiError } from "@/api/client"
import { useAcceptInvitation, useInvitationPreview } from "@/api/hooks/account"
import { BrandMark } from "@/components/ui/BrandMark"
import { Button } from "@/components/ui/Button"
import { ErrorState } from "@/components/ui/ErrorState"
import { Field } from "@/components/ui/Field"
import { Input } from "@/components/ui/Input"
import { Skeleton } from "@/components/ui/Skeleton"
import { useAsyncAction } from "@/hooks/useAsyncAction"

const EXPIRED = "This invitation has expired. Ask your agency owner for a new one."
const MIN_PASSWORD = 10
const NAME_REQUIRED = "Enter your name."
const PASSWORD_TOO_SHORT = `Use at least ${MIN_PASSWORD} characters.`
const FAILED = "We could not create your account. Try again."
/** A newly accepted coordinator lands on their own home, never the owner dashboard. */
const COORDINATOR_HOME = "/next-actions"

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-app px-4 py-8">
      <div className="w-full max-w-[400px] rounded-modal bg-surface p-8 shadow-modal">{children}</div>
    </div>
  )
}

function InvitationGone() {
  return (
    <Card>
      <BrandMark size={40} />
      <h1 className="mt-5 font-display text-[22px] font-semibold text-ink">Invitation expired</h1>
      <p role="alert" className="mt-2 text-[14px] text-ink-muted">
        {EXPIRED}
      </p>
    </Card>
  )
}

/**
 * Public accept-invitation screen: the token is in the URL only (never stored), the agency and email come
 * from the preview, and creating the account signs the new coordinator in and sends them to /next-actions.
 */
export function AcceptInvitePage() {
  const { token = "" } = useParams<{ token: string }>()
  const preview = useInvitationPreview(token)
  const accept = useAcceptInvitation(token)
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [gone, setGone] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  const submit = useAsyncAction(async () => {
    setNameError(null)
    setPasswordError(null)
    setFormError(null)
    const who = name.trim()
    // The button only waits for the fields to be filled in, so both checks below are real: the error lands
    // on the field that failed and focus goes with it.
    if (who === "") {
      setNameError(NAME_REQUIRED)
      nameRef.current?.focus()
      return
    }
    if (password.length < MIN_PASSWORD) {
      setPasswordError(PASSWORD_TOO_SHORT)
      passwordRef.current?.focus()
      return
    }
    try {
      await accept.mutateAsync({ name: who, password })
      // A full load, not a router push: this screen is public (no session) and AuthProvider has already
      // marked the signed-out `/me` 401 as an expired session, so only a fresh boot picks up the new
      // coordinator cookie. Nothing is stored client-side here — the session comes from the response.
      window.location.assign(COORDINATOR_HOME)
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 410) setGone(true)
      else if (caught instanceof ApiError && caught.code === "weak_password") {
        setPasswordError(PASSWORD_TOO_SHORT)
        passwordRef.current?.focus()
      } else setFormError(FAILED)
    }
  })

  if (gone || (preview.error instanceof ApiError && preview.error.status === 410)) return <InvitationGone />

  if (preview.isPending) {
    return (
      <Card>
        <Skeleton className="h-[220px]" />
      </Card>
    )
  }

  if (preview.isError) {
    return (
      <Card>
        <BrandMark size={40} />
        <div className="mt-5">
          <ErrorState message="We could not open this invitation." onRetry={() => void preview.refetch()} />
        </div>
      </Card>
    )
  }

  // Only the empty form is blocked: the format rules below report themselves per field, with focus.
  const ready = name !== "" && password !== ""

  return (
    <Card>
      <BrandMark size={40} />
      <h1 className="mt-5 font-display text-[22px] font-semibold text-ink">Create your account</h1>
      <p className="mt-1 text-[14px] text-ink-muted">
        You were invited to join {preview.data.agency_name} as a coordinator.
      </p>
      <form
        className="mt-6 flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          void submit.run()
        }}
        noValidate
      >
        <Field label="Email">
          <Input type="email" readOnly className="bg-subtle" value={preview.data.email} />
        </Field>
        <Field label="Your name" error={nameError ?? undefined}>
          <Input
            ref={nameRef}
            autoComplete="name"
            value={name}
            onChange={(event) => {
              setName(event.target.value)
              if (nameError) setNameError(null)
            }}
          />
        </Field>
        <Field label="Password" error={passwordError ?? undefined} hint={`At least ${MIN_PASSWORD} characters`}>
          <Input
            ref={passwordRef}
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value)
              if (passwordError) setPasswordError(null)
            }}
          />
        </Field>
        {formError && (
          <p role="alert" className="text-[13px] font-medium text-danger-text">
            {formError}
          </p>
        )}
        <Button type="submit" className="w-full" pending={submit.pending} disabled={!ready}>
          Create account
        </Button>
      </form>
    </Card>
  )
}

import { useEffect, useId, useRef, useState } from "react"
import { Copy } from "lucide-react"
import { ApiError } from "@/api/client"
import { useCoordinatorNames, useDeleteInvitation, useInviteCoordinator, useTeam } from "@/api/hooks/account"
import type { Team } from "@/api/types"
import { Avatar } from "@/components/ui/Avatar"
import { Button } from "@/components/ui/Button"
import { ConfirmInline } from "@/components/ui/ConfirmInline"
import { ErrorState } from "@/components/ui/ErrorState"
import { Field } from "@/components/ui/Field"
import { Input } from "@/components/ui/Input"
import { Pill } from "@/components/ui/Pill"
import { Skeleton } from "@/components/ui/Skeleton"
import { useToast } from "@/components/ui/Toast"
import { useAsyncAction } from "@/hooks/useAsyncAction"

type TeamUser = Team["users"][number]
type Invitation = Team["invitations"][number]

const INVITED = "Invitation sent"
const REVOKE_FAILED = "We could not revoke that invitation. Try again."
const SEND_FAILED = "We could not send the invitation. Try again."
const INVALID_EMAIL = "Enter a valid email address."
/** Deliberately loose: the API stays the source of truth, this only catches obvious typos before a request. */
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

const ROLE_PILL: Record<TeamUser["role"], { tone: "brand" | "neutral"; label: string }> = {
  owner: { tone: "brand", label: "Owner" },
  coordinator: { tone: "neutral", label: "Coordinator" },
}

function PersonRow({ user }: { user: TeamUser }) {
  const pill = ROLE_PILL[user.role]
  return (
    <li className="flex items-center gap-3 border-b border-line-subtle py-2.5 last:border-0">
      <Avatar name={user.name} size={36} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium text-ink">{user.name}</span>
        <span className="block truncate text-[12px] text-ink-muted">{user.email}</span>
      </span>
      <Pill tone={pill.tone}>{pill.label}</Pill>
    </li>
  )
}

/**
 * The Team card: everyone in the agency plus the pending invitations, with an invite form in a `bg-app`
 * footer. The `accept_url` comes back only from the create response (there is no email provider yet), so
 * the new row carries a Copy invite link button that is not part of the stored invitation.
 */
export function TeamCard() {
  const team = useTeam()
  const names = useCoordinatorNames()
  const send = useInviteCoordinator()
  const remove = useDeleteInvitation()
  const toast = useToast()
  const listId = useId()

  const [email, setEmail] = useState("")
  const [coordinator, setCoordinator] = useState("")
  const [sent, setSent] = useState<Invitation | null>(null)
  const [revoking, setRevoking] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [coordinatorError, setCoordinatorError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const emailRef = useRef<HTMLInputElement>(null)
  const coordinatorRef = useRef<HTMLInputElement>(null)
  /** Each pending-invitation row, so focus can return to its Revoke trigger after an inline confirmation. */
  const rows = useRef(new Map<string, HTMLLIElement>())
  const focusAfterConfirm = useRef<{ kind: "trigger"; id: string } | { kind: "email" } | null>(null)

  // The Revoke trigger unmounts while confirming (only the confirmation's buttons remain), so focus is
  // restored after the state settles: to that row's trigger (cancel / failure) or to the invite email input
  // once the row is gone.
  useEffect(() => {
    if (revoking !== null) return
    const target = focusAfterConfirm.current
    if (!target) return
    focusAfterConfirm.current = null
    if (target.kind === "email") emailRef.current?.focus()
    else rows.current.get(target.id)?.querySelector<HTMLButtonElement>("[data-revoke-trigger]")?.focus()
  }, [revoking])

  const invite = useAsyncAction(async () => {
    setEmailError(null)
    setCoordinatorError(null)
    setFormError(null)
    const address = email.trim()
    if (!EMAIL_RE.test(address)) {
      setEmailError(INVALID_EMAIL)
      emailRef.current?.focus()
      return
    }
    try {
      const created = await send.mutateAsync({ email: address, coordinator_name: coordinator.trim() })
      setSent(created)
      setEmail("")
      setCoordinator("")
      toast.show(INVITED, { tone: "success" })
      emailRef.current?.focus()
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "unknown_coordinator") {
        const valid = Array.isArray(caught.extra.valid_names) ? (caught.extra.valid_names as string[]) : []
        setCoordinatorError(valid.length > 0 ? `Pick one of: ${valid.join(", ")}` : "Pick a coordinator from your data.")
        coordinatorRef.current?.focus()
      } else if (caught instanceof ApiError && caught.code === "invalid_email") {
        setEmailError(INVALID_EMAIL)
        emailRef.current?.focus()
      } else if (caught instanceof ApiError && caught.status >= 400 && caught.status < 500 && caught.message !== "") {
        // The error envelope's `message` is written for the user (a duplicate invite, already a member, …):
        // showing it beats a generic line that hides what actually happened.
        setFormError(caught.message)
      } else {
        setFormError(SEND_FAILED)
      }
    }
  })

  const revoke = useAsyncAction(async (id: string) => {
    setFormError(null)
    try {
      await remove.mutateAsync(id)
      focusAfterConfirm.current = { kind: "email" }
      if (sent?.id === id) setSent(null)
    } catch {
      focusAfterConfirm.current = { kind: "trigger", id }
      setFormError(REVOKE_FAILED)
    } finally {
      setRevoking(null)
    }
  })

  const copyLink = async () => {
    if (!sent?.accept_url) return
    try {
      await navigator.clipboard.writeText(sent.accept_url)
      toast.show("Invite link copied", { tone: "success" })
    } catch {
      toast.show("Could not copy: select the link and copy it manually")
    }
  }

  const header = (
    <div>
      <h2 id="team-heading" className="font-display text-[16px] font-semibold text-ink">
        Team
      </h2>
      <p className="mt-0.5 text-[13px] text-ink-muted">Owners see everything. Coordinators see only their own leads.</p>
    </div>
  )

  const footer = (
    <div className="border-t border-line bg-app p-5">
      <form
        className="flex flex-col gap-3 md:flex-row md:items-end"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void invite.run()
        }}
      >
        <Field label="Email" className="md:flex-1" error={emailError ?? undefined}>
          <Input
            ref={emailRef}
            type="email"
            autoComplete="off"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value)
              if (emailError) setEmailError(null)
            }}
          />
        </Field>
        <Field
          label="Coordinator"
          className="md:flex-1"
          error={coordinatorError ?? undefined}
          hint={
            names.isError
              ? "We could not load your coordinator names — type the name exactly as it appears in your data."
              : undefined
          }
        >
          <Input
            ref={coordinatorRef}
            list={listId}
            autoComplete="off"
            value={coordinator}
            onChange={(event) => {
              setCoordinator(event.target.value)
              if (coordinatorError) setCoordinatorError(null)
            }}
          />
          <datalist id={listId}>
            {(names.data?.names ?? []).map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </Field>
        <Button type="submit" pending={invite.pending} disabled={email.trim() === "" || coordinator.trim() === ""}>
          Invite
        </Button>
      </form>
      {formError && (
        <p role="alert" className="mt-3 text-[13px] font-medium text-danger-text">
          {formError}
        </p>
      )}
    </div>
  )

  const users = team.data?.users ?? []
  const invitations = team.data?.invitations ?? []

  if (team.isError) {
    return (
      <section aria-labelledby="team-heading" className="overflow-hidden rounded-card border border-line bg-surface">
        <div className="flex flex-col gap-3 p-5">
          {header}
          <ErrorState message="We could not load your team." onRetry={() => void team.refetch()} />
        </div>
        {footer}
      </section>
    )
  }

  return (
    <section aria-labelledby="team-heading" className="overflow-hidden rounded-card border border-line bg-surface">
      <div className="flex flex-col gap-1 p-5">
        {header}
        {team.isPending ? (
          <Skeleton className="mt-2 h-[132px]" />
        ) : (
          <ul className="flex flex-col">
            {users.map((user) => (
              <PersonRow key={user.id} user={user} />
            ))}
            {invitations.map((invitation) => (
              <li
                key={invitation.id}
                ref={(node) => {
                  if (node) rows.current.set(invitation.id, node)
                  else rows.current.delete(invitation.id)
                }}
                className="flex flex-col gap-2 border-b border-line-subtle py-2.5 last:border-0"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <Avatar name={invitation.coordinator_name || invitation.email} size={36} tone="warning" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium text-ink">{invitation.email}</span>
                    <span className="block truncate text-[12px] text-ink-muted">{invitation.coordinator_name}</span>
                  </span>
                  <Pill tone="warning">Invited</Pill>
                  {sent?.id === invitation.id && sent.accept_url ? (
                    <Button
                      variant="outline-brand"
                      size="sm"
                      leftIcon={<Copy aria-hidden className="h-3.5 w-3.5" />}
                      onClick={() => void copyLink()}
                    >
                      Copy invite link
                    </Button>
                  ) : null}
                  {/* Independent of the copy button: a mistyped email must be revocable right away. */}
                  {revoking === invitation.id ? null : (
                    <Button
                      data-revoke-trigger
                      variant="ghost"
                      size="sm"
                      onClick={() => setRevoking(invitation.id)}
                    >
                      Revoke
                    </Button>
                  )}
                </div>
                {revoking === invitation.id && (
                  <ConfirmInline
                    message={`Revoke the invitation for ${invitation.email}?`}
                    confirmLabel="Revoke"
                    pending={revoke.pending}
                    onCancel={() => {
                      focusAfterConfirm.current = { kind: "trigger", id: invitation.id }
                      setRevoking(null)
                    }}
                    onConfirm={() => void revoke.run(invitation.id)}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {footer}
    </section>
  )
}

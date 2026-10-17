import { useId, useState } from "react"
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
  const [error, setError] = useState<string | null>(null)

  const invite = useAsyncAction(async () => {
    setError(null)
    try {
      const created = await send.mutateAsync({ email: email.trim(), coordinator_name: coordinator.trim() })
      setSent(created)
      setEmail("")
      setCoordinator("")
      toast.show(INVITED, { tone: "success" })
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "unknown_coordinator") {
        const valid = Array.isArray(caught.extra.valid_names) ? (caught.extra.valid_names as string[]) : []
        setError(valid.length > 0 ? `Pick one of: ${valid.join(", ")}` : "Pick a coordinator from your data.")
      } else if (caught instanceof ApiError && caught.code === "invalid_email") {
        setError("Enter a valid email address.")
      } else {
        setError(SEND_FAILED)
      }
    }
  })

  const revoke = useAsyncAction(async (id: string) => {
    setError(null)
    try {
      await remove.mutateAsync(id)
      setRevoking(null)
      if (sent?.id === id) setSent(null)
    } catch {
      setRevoking(null)
      setError(REVOKE_FAILED)
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
        onSubmit={(event) => {
          event.preventDefault()
          void invite.run()
        }}
      >
        <Field label="Email" className="md:flex-1">
          <Input type="email" autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} />
        </Field>
        <Field label="Coordinator" className="md:flex-1">
          <Input
            list={listId}
            autoComplete="off"
            value={coordinator}
            onChange={(event) => setCoordinator(event.target.value)}
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
      {error && (
        <p role="alert" className="mt-3 text-[13px] font-medium text-danger-text">
          {error}
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
              <li key={invitation.id} className="flex flex-col gap-2 border-b border-line-subtle py-2.5 last:border-0">
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
                    <Button variant="ghost" size="sm" onClick={() => setRevoking(invitation.id)}>
                      Revoke
                    </Button>
                  )}
                </div>
                {revoking === invitation.id && (
                  <ConfirmInline
                    message={`Revoke the invitation for ${invitation.email}?`}
                    confirmLabel="Revoke"
                    pending={revoke.pending}
                    onCancel={() => setRevoking(null)}
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

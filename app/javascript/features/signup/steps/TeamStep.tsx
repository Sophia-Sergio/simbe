import { useState } from "react"
import { UserPlus } from "lucide-react"
import { ApiError } from "@/api/client"
import { useCoordinatorNames, useInviteCoordinator, useTeam } from "@/api/hooks/account"
import type { User } from "@/api/types"
import { Avatar } from "@/components/ui/Avatar"
import { Button, LinkButton } from "@/components/ui/Button"
import { Field } from "@/components/ui/Field"
import { Input } from "@/components/ui/Input"
import { Pill } from "@/components/ui/Pill"
import { Select } from "@/components/ui/Select"
import { useToast } from "@/components/ui/Toast"
import { useAsyncAction } from "@/hooks/useAsyncAction"

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

function unknownCoordinator(error: ApiError): string {
  const names = error.extra.valid_names
  if (Array.isArray(names) && names.length > 0) return `Pick one of: ${names.join(", ")}`
  return "Pick one of the coordinators in your data"
}

/** Why the Invite button is still disabled, in the user's terms. */
function inviteHint(emailValid: boolean, coordinatorPicked: boolean): string {
  if (!emailValid && !coordinatorPicked) return "Enter an email and choose a coordinator to invite."
  if (!emailValid) return "Enter a valid email to invite."
  return "Choose a coordinator to invite."
}

/**
 * Step 5: invite coordinators (email + a name that exists in the data) and open the dashboard.
 * Optional: a coordinator's login is tied to a coordinator name in the loaded data, so the picker
 * is empty until step 4 has run (`onLoadData` takes the user back to it).
 */
export function TeamStep({ owner, onLoadData }: { owner: User | null; onLoadData?: () => void }) {
  const team = useTeam()
  const names = useCoordinatorNames()
  const invite = useInviteCoordinator()
  const toast = useToast()
  const [email, setEmail] = useState("")
  const [coordinator, setCoordinator] = useState("")
  const [emailError, setEmailError] = useState<string | null>(null)
  const [coordinatorError, setCoordinatorError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const options = (names.data?.names ?? []).map((name) => ({ value: name, label: name }))
  const emailValid = EMAIL.test(email.trim())
  const ready = emailValid && coordinator !== ""
  const noCoordinators = names.isSuccess && options.length === 0
  const ownerUser = team.data?.users.find((user) => user.role === "owner") ?? owner
  const invitations = team.data?.invitations ?? []
  // Everyone who already has a seat or an invitation: inviting them again would be a duplicate.
  const knownEmails = new Set(
    [...(team.data?.users ?? []).map((user) => user.email), ...invitations.map((invitation) => invitation.email)].map((address) =>
      address.toLowerCase(),
    ),
  )

  const send = useAsyncAction(async () => {
    setEmailError(null)
    setCoordinatorError(null)
    setFormError(null)
    const address = email.trim()
    if (knownEmails.has(address.toLowerCase())) {
      setEmailError("That email is already on your team")
      return
    }
    try {
      await invite.mutateAsync({ email: address, coordinator_name: coordinator })
      toast.show("Invitation sent")
      setEmail("")
      setCoordinator("")
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "unknown_coordinator") setCoordinatorError(unknownCoordinator(caught))
      else if (caught instanceof ApiError && caught.code === "invalid_email") setEmailError(caught.message)
      else if (caught instanceof ApiError) setFormError(caught.message)
      else setFormError("Something went wrong. Try again.")
    }
  })

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      toast.show("Invite link copied")
    } catch {
      // Clipboard access is best-effort (also unavailable in some test environments).
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <p className="text-[13px] text-ink-muted">Optional — you can invite coordinators later from your dashboard.</p>
        <Field label="Email" error={emailError ?? undefined}>
          <Input
            type="email"
            autoComplete="off"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value)
              setEmailError(null)
            }}
          />
        </Field>
        {noCoordinators ? (
          <div className="flex flex-col items-start gap-1 rounded-card border border-line bg-subtle p-3">
            <p className="text-[13px] text-ink-secondary">
              No coordinators yet. Coordinators come from your CRM data, so load it first (step 4).
            </p>
            {onLoadData ? (
              <button type="button" onClick={onLoadData} className="inline-flex min-h-11 items-center text-[13px] font-semibold text-brand-text">
                Go to Load your data
              </button>
            ) : null}
          </div>
        ) : (
          <Field
            label="Which coordinator is this?"
            hint="Pick who they are in your data. They will only see that coordinator's leads."
            error={coordinatorError ?? undefined}
          >
            <Select
              aria-label="Coordinator"
              options={options}
              value={coordinator}
              onChange={(value) => {
                setCoordinator(value)
                setCoordinatorError(null)
              }}
              placeholder="Choose a coordinator"
            />
          </Field>
        )}
        {formError ? (
          <p role="alert" className="text-[12px] font-medium text-danger-text">
            {formError}
          </p>
        ) : null}
        <Button className="self-start" leftIcon={<UserPlus aria-hidden className="h-4 w-4" />} disabled={!ready} pending={send.pending} onClick={() => void send.run()}>
          Invite
        </Button>
        {!ready && !noCoordinators ? <p className="text-[12px] text-ink-muted">{inviteHint(emailValid, coordinator !== "")}</p> : null}
      </div>

      <ul className="flex flex-col divide-y divide-line-subtle">
        {ownerUser ? (
          <li className="flex items-center gap-3 py-2.5">
            <Avatar name={ownerUser.name} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium text-ink">{ownerUser.name}</p>
              <p className="truncate text-[12px] text-ink-muted">{ownerUser.email}</p>
            </div>
            <Pill tone="brand">Owner</Pill>
          </li>
        ) : null}
        {invitations.map((invitation) => {
          const acceptUrl = invitation.accept_url
          return (
            <li key={invitation.id} className="flex items-center gap-3 py-2.5">
              <Avatar name={invitation.coordinator_name ?? invitation.email} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium text-ink">{invitation.email}</p>
                <p className="truncate text-[12px] text-ink-muted">{invitation.coordinator_name}</p>
              </div>
              <Pill tone="warning">Invited</Pill>
              {acceptUrl ? (
                <Button variant="ghost" size="sm" onClick={() => void copyLink(acceptUrl)}>
                  Copy invite link
                </Button>
              ) : null}
            </li>
          )
        })}
      </ul>

      <LinkButton to="/" reloadDocument className="w-full">
        Open my dashboard
      </LinkButton>
    </div>
  )
}

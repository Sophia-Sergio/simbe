import { useState } from "react"
import type { ReactNode } from "react"
import { Navigate } from "react-router-dom"
import { ApiError } from "@/api/client"
import { useSignup } from "@/api/hooks/account"
import { useCurrentSnapshot } from "@/api/hooks/snapshots"
import type { User } from "@/api/types"
import { useAuth } from "@/app/auth/useAuth"
import type { Milestone } from "@/components/shared/options"
import { TIMEZONES } from "@/components/shared/options"
import { Button } from "@/components/ui/Button"
import { ConfirmInline } from "@/components/ui/ConfirmInline"
import { Skeleton } from "@/components/ui/Skeleton"
import { useAsyncAction } from "@/hooks/useAsyncAction"
import { WizardShell } from "./WizardShell"
import { agencyFieldErrors } from "./agencyErrors"
import { AccountStep } from "./steps/AccountStep"
import { AgencyStep } from "./steps/AgencyStep"
import { LoadDataStep } from "./steps/LoadDataStep"
import { TeamStep } from "./steps/TeamStep"

export type AccountDraft = { name: string; email: string; password: string }
export type AgencyDraft = { name: string; timezone: string; milestone: Milestone }

export type AccountField = "name" | "email" | "password"
export type FieldErrors = Partial<Record<AccountField, string>>

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
/** The server's minimum (spec decision 1); the client says the same thing before a round trip. */
const MIN_PASSWORD = 10

/** Messages for step 1, shown once the field has been left (or when the server rejects a submit). */
function accountMessages(account: AccountDraft): FieldErrors {
  const messages: FieldErrors = {}
  if (account.name.trim() === "") messages.name = "Enter your name"
  if (!EMAIL.test(account.email.trim())) messages.email = "Enter a valid work email"
  if (account.password.length < MIN_PASSWORD) messages.password = `Use at least ${MIN_PASSWORD} characters`
  return messages
}

const AGENCY_NAME_REQUIRED = "Enter your agency name"
const ERROR_SUMMARY = "Check the highlighted fields below."

/** Step 1 is complete when the name, a valid email and a ≥10-character password are there. */
export function isAccountValid(account: AccountDraft): boolean {
  return account.name.trim().length > 0 && EMAIL.test(account.email.trim()) && account.password.length >= MIN_PASSWORD
}

const STEPS = [
  { title: "Create your account", subtitle: "Start your agency workspace in Simbe." },
  { title: "Set up your agency", subtitle: "This sets how Simbe counts success for your agency." },
  { title: "Load your data", subtitle: "Upload the seven exports from your CRM." },
  { title: "Invite your team", subtitle: "Add coordinators so they can work their leads." },
] as const

/**
 * The four-step sign-up wizard (spec decision 1): steps 1–2 collect everything client-side and
 * `POST /signup` fires at the end of step 2; steps 3–4 run authenticated.
 *
 * `/signup` is a public route, so the page itself is the guard: a signed-in visitor must not be able
 * to create a second agency (and a refresh in steps 3–4 must not drop them back to step 1).
 */
export function SignUpPage() {
  const { status } = useAuth()

  if (status === "loading") return <Skeleton className="h-screen w-full" />
  if (status === "authenticated") return <SignedInOnboarding />
  return <Wizard />
}

/**
 * A signed-in visitor: onboarding that never loaded a snapshot resumes at step 3 (the first
 * authenticated step, so a refresh mid-wizard continues instead of restarting); an agency that
 * already has data — or a coordinator, who never onboards — goes to its home instead.
 *
 * The "already has data" decision is made once, when the page is entered. The wizard's own load
 * creates the first snapshot while the owner is still on step 3, and that must not eject them to the
 * dashboard before "Your data is loaded" and the team step.
 */
function SignedInOnboarding() {
  const { agency, user, role } = useAuth()
  const snapshot = useCurrentSnapshot()
  // null until the first answer arrives; never changes after that.
  const [hadDataOnEntry, setHadDataOnEntry] = useState<boolean | null>(null)

  if (snapshot.isPending) return <Skeleton className="h-screen w-full" />
  if (hadDataOnEntry === null) setHadDataOnEntry(Boolean(snapshot.data?.snapshot))
  if (role === "coordinator") return <Navigate to="/next-actions" replace />
  if (hadDataOnEntry ?? Boolean(snapshot.data?.snapshot)) return <Navigate to="/" replace />
  return <Wizard initialStep={3} createdAgencyName={agency?.name} createdOwner={user} />
}

function Wizard({
  initialStep = 1,
  createdAgencyName,
  createdOwner,
}: {
  initialStep?: number
  createdAgencyName?: string
  createdOwner?: User | null
} = {}) {
  const signup = useSignup()
  const [step, setStep] = useState(initialStep)
  const [account, setAccount] = useState<AccountDraft>({ name: "", email: "", password: "" })
  const [agency, setAgency] = useState<AgencyDraft>({ name: "", timezone: TIMEZONES[0].value, milestone: "consult_attended" })
  const [serverErrors, setServerErrors] = useState<FieldErrors>({})
  const [touched, setTouched] = useState<Partial<Record<AccountField | "agency", boolean>>>({})
  const [serverAgencyError, setServerAgencyError] = useState<string | null>(null)
  // Step 3 owns an upload; once visited it stays mounted (hidden) so Back/Continue never cancel it.
  const [loadDataVisited, setLoadDataVisited] = useState(initialStep === 3)
  // Files uploaded to step 3 but not loaded: leaving the step then asks first (the dashboard would be empty).
  const [unloaded, setUnloaded] = useState(false)
  const [confirmingLeave, setConfirmingLeave] = useState(false)
  const leaveLoadData = () => {
    if (unloaded) setConfirmingLeave(true)
    else go(4)
  }
  const go = (target: number) => {
    if (target === 3) setLoadDataVisited(true)
    setStep(target)
  }
  const [focusRequest, setFocusRequest] = useState<{ field: AccountField } | null>(null)

  const created = signup.data ?? null
  const agencyName = created?.agency.name ?? createdAgencyName ?? agency.name.trim()
  const owner = created?.user ?? createdOwner ?? null

  // Client messages appear once a field has been left; a server message (email_taken, …) wins.
  const messages = accountMessages(account)
  const accountErrors: FieldErrors = {
    ...(touched.name ? { name: messages.name } : {}),
    ...(touched.email ? { email: messages.email } : {}),
    ...(touched.password ? { password: messages.password } : {}),
    ...serverErrors,
  }
  const serverAgencyErrors = agencyFieldErrors(serverAgencyError)
  const agencyError = serverAgencyErrors.name ?? (touched.agency && agency.name.trim() === "" ? AGENCY_NAME_REQUIRED : null)
  // A rejected submit gets one live region above the fields; blur messages speak for themselves.
  const alert = Object.values(serverErrors).some(Boolean) || serverAgencyError ? ERROR_SUMMARY : null

  const patchAccount = (patch: Partial<AccountDraft>) => {
    setAccount((previous) => ({ ...previous, ...patch }))
    // Editing a field clears its *server* message; an undefined value must not shadow the client one.
    setServerErrors((previous) => {
      const next = { ...previous }
      for (const field of Object.keys(patch) as AccountField[]) delete next[field]
      return next
    })
  }

  const submit = useAsyncAction(async () => {
    setServerErrors({})
    setServerAgencyError(null)
    try {
      await signup.mutateAsync({
        user: { name: account.name.trim(), email: account.email.trim(), password: account.password },
        agency: { name: agency.name.trim(), timezone: agency.timezone, qualified_milestone: agency.milestone },
      })
      setStep(3)
    } catch (caught) {
      if (!(caught instanceof ApiError)) {
        setServerAgencyError("Something went wrong. Try again.")
        return
      }
      // The account is created on submit, so a taken email / weak password sends the user back to step 1.
      if (caught.code === "email_taken") {
        setServerErrors({ email: caught.message || "That email already has an account" })
        setStep(1)
        setFocusRequest({ field: "email" })
        return
      }
      if (caught.code === "weak_password") {
        setServerErrors({ password: caught.message || `Use at least ${MIN_PASSWORD} characters` })
        setStep(1)
        setFocusRequest({ field: "password" })
        return
      }
      setServerAgencyError(caught.code === "invalid_agency" ? caught.message : "Something went wrong. Try again.")
    }
  })

  // Once `POST /signup` has created the account, the wizard must not walk back to steps 1–2 (a
  // second submit would be a duplicate account); Back is only offered on step 2.
  // Steps 3–4 are free to revisit (step 3 stays mounted, so a running upload survives); step 3 has
  // nowhere to go back to.
  const back =
    step === 2 ? (
      <Button variant="secondary" onClick={() => setStep(1)}>
        Back
      </Button>
    ) : step === 4 ? (
      <Button variant="secondary" onClick={() => go(3)}>
        Back
      </Button>
    ) : (
      <span />
    )

  let next: ReactNode = null
  if (step === 1) {
    next = (
      <Button disabled={!isAccountValid(account)} onClick={() => setStep(2)}>
        Continue
      </Button>
    )
  } else if (step === 2) {
    next = (
      <Button disabled={agency.name.trim() === ""} pending={submit.pending} onClick={() => void submit.run()}>
        Continue
      </Button>
    )
  } else if (step === 3) {
    // Step 3 may continue at any time (a running load finishes in the background), but not silently
    // with files that were uploaded and never loaded.
    next = <Button onClick={leaveLoadData}>Continue</Button>
  }
  const leaveWarning =
    step === 3 && unloaded && confirmingLeave ? (
      <div role="alert" className="w-full">
        <ConfirmInline
          tone="brand"
          message="Your files are uploaded but your data hasn't been loaded yet, so your dashboard will be empty. Load it first, or continue without it."
          cancelLabel="Stay and load"
          confirmLabel="Continue without loading"
          onCancel={() => setConfirmingLeave(false)}
          onConfirm={() => {
            setConfirmingLeave(false)
            go(4)
          }}
        />
      </div>
    ) : null

  return (
    <WizardShell
      step={step}
      firstReachable={step >= 3 ? 3 : undefined}
      onGo={(target) => (step === 3 && target > 3 ? leaveLoadData() : go(target))}
      title={STEPS[step - 1].title} subtitle={STEPS[step - 1].subtitle} alert={alert} footer={leaveWarning ?? <>{back}{next}</>}>
      {step === 1 ? (
        <AccountStep
          value={account}
          onChange={patchAccount}
          onBlur={(field) => setTouched((previous) => ({ ...previous, [field]: true }))}
          errors={accountErrors}
          focusRequest={focusRequest}
        />
      ) : null}
      {step === 2 ? (
        <AgencyStep
          value={agency}
          error={agencyError}
          timezoneError={serverAgencyErrors.timezone}
          milestoneError={serverAgencyErrors.milestone}
          onChange={(patch) => {
            setAgency((previous) => ({ ...previous, ...patch }))
            setServerAgencyError(null)
          }}
          onBlur={() => setTouched((previous) => ({ ...previous, agency: true }))}
        />
      ) : null}
      {loadDataVisited || step === 3 ? (
        <div hidden={step !== 3}>
          <LoadDataStep agencyName={agencyName} onSkip={leaveLoadData} onUnloadedChange={setUnloaded} />
        </div>
      ) : null}
      {step === 4 ? <TeamStep owner={owner} onLoadData={() => go(3)} /> : null}
    </WizardShell>
  )
}

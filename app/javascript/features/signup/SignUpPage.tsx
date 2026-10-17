import { useState } from "react"
import type { ReactNode } from "react"
import { ApiError } from "@/api/client"
import { useSignup } from "@/api/hooks/account"
import type { Milestone } from "@/components/shared/options"
import { TIMEZONES } from "@/components/shared/options"
import { Button } from "@/components/ui/Button"
import { useAsyncAction } from "@/hooks/useAsyncAction"
import { WizardShell } from "./WizardShell"
import { AccountStep } from "./steps/AccountStep"
import { AdAccountsStep } from "./steps/AdAccountsStep"
import { AgencyStep } from "./steps/AgencyStep"
import { LoadDataStep } from "./steps/LoadDataStep"
import { TeamStep } from "./steps/TeamStep"

export type AccountDraft = { name: string; email: string; password: string }
export type AgencyDraft = { name: string; timezone: string; milestone: Milestone }

export type FieldErrors = Partial<Record<"name" | "email" | "password", string>>

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** Step 1 is complete when the name, a valid email and a ≥10-character password are there. */
export function isAccountValid(account: AccountDraft): boolean {
  return account.name.trim().length > 0 && EMAIL.test(account.email.trim()) && account.password.length >= 10
}

const STEPS = [
  { title: "Create your account", subtitle: "Start your agency workspace in Simbe." },
  { title: "Set up your agency", subtitle: "This sets how Simbe counts success for your agency." },
  { title: "Connect your ad accounts", subtitle: "Optional — connect now or later in Settings." },
  { title: "Load your data", subtitle: "Upload the seven exports from your CRM." },
  { title: "Invite your team", subtitle: "Add coordinators so they can work their leads." },
] as const

/**
 * The five-step sign-up wizard (spec decision 1): steps 1–2 collect everything client-side and
 * `POST /signup` fires at the end of step 2; steps 3–5 run authenticated. The signup response is the
 * source for the created agency and owner, so the later steps do not depend on the auth context
 * refreshing mid-flow.
 */
export function SignUpPage() {
  const signup = useSignup()
  const [step, setStep] = useState(1)
  const [account, setAccount] = useState<AccountDraft>({ name: "", email: "", password: "" })
  const [agency, setAgency] = useState<AgencyDraft>({ name: "", timezone: TIMEZONES[0].value, milestone: "consult_attended" })
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [agencyError, setAgencyError] = useState<string | null>(null)

  const created = signup.data ?? null
  const agencyName = created?.agency.name ?? agency.name.trim()
  const owner = created?.user ?? null

  const patchAccount = (patch: Partial<AccountDraft>) => {
    setAccount((previous) => ({ ...previous, ...patch }))
    setFieldErrors((previous) => ({
      ...previous,
      ...(patch.name !== undefined ? { name: undefined } : {}),
      ...(patch.email !== undefined ? { email: undefined } : {}),
      ...(patch.password !== undefined ? { password: undefined } : {}),
    }))
  }

  const submit = useAsyncAction(async () => {
    setFieldErrors({})
    setAgencyError(null)
    try {
      await signup.mutateAsync({
        user: { name: account.name.trim(), email: account.email.trim(), password: account.password },
        agency: { name: agency.name.trim(), timezone: agency.timezone, qualified_milestone: agency.milestone },
      })
      setStep(3)
    } catch (caught) {
      if (!(caught instanceof ApiError)) {
        setAgencyError("Something went wrong. Try again.")
        return
      }
      // The account is created on submit, so a taken email / weak password sends the user back to step 1.
      if (caught.code === "email_taken") {
        setFieldErrors({ email: caught.message || "That email already has an account" })
        setStep(1)
        return
      }
      if (caught.code === "weak_password") {
        setFieldErrors({ password: caught.message || "Password must be at least 10 characters" })
        setStep(1)
        return
      }
      setAgencyError(caught.code === "invalid_agency" ? caught.message : "Something went wrong. Try again.")
    }
  })

  // Once `POST /signup` has created the account, the wizard must not walk back to steps 1–2 (a
  // second submit would be a duplicate account); Back is only offered on step 2.
  const back =
    step === 2 ? (
      <Button variant="secondary" onClick={() => setStep(1)}>
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
  } else if (step === 3 || step === 4) {
    // Step 4 may continue at any time: a load that is still running finishes in the background.
    next = <Button onClick={() => setStep(step + 1)}>Continue</Button>
  }

  return (
    <WizardShell step={step} title={STEPS[step - 1].title} subtitle={STEPS[step - 1].subtitle} footer={<>{back}{next}</>}>
      {step === 1 ? <AccountStep value={account} onChange={patchAccount} errors={fieldErrors} /> : null}
      {step === 2 ? (
        <AgencyStep
          value={agency}
          error={agencyError}
          onChange={(patch) => {
            setAgency((previous) => ({ ...previous, ...patch }))
            setAgencyError(null)
          }}
        />
      ) : null}
      {step === 3 ? <AdAccountsStep /> : null}
      {step === 4 ? <LoadDataStep agencyName={agencyName} onSkip={() => setStep(5)} /> : null}
      {step === 5 ? <TeamStep owner={owner} /> : null}
    </WizardShell>
  )
}

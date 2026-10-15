import { useState } from "react"
import type { FormEvent } from "react"
import { Link, Navigate, useSearchParams } from "react-router-dom"
import { useAuth } from "@/app/auth/useAuth"
import { ApiError } from "@/api/client"
import type { Role } from "@/api/types"
import { BrandMark } from "@/components/ui/BrandMark"
import { Button } from "@/components/ui/Button"
import { Field } from "@/components/ui/Field"
import { Input } from "@/components/ui/Input"
import { Skeleton } from "@/components/ui/Skeleton"
import { useAsyncAction } from "@/hooks/useAsyncAction"

const homeFor = (role: Role | null): string => (role === "coordinator" ? "/next-actions" : "/")

// `next` comes from the URL, so only same-origin absolute paths are followed (no `//host`, no `/\host`, no schemes).
const safeNext = (next: string | null): string | null => (next && /^\/(?![/\\])/.test(next) ? next : null)

const INCORRECT = "Email or password is incorrect"
const GENERIC = "Something went wrong. Try again."

export function SignInPage() {
  const { status, role, signIn } = useAuth()
  const [params] = useSearchParams()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const action = useAsyncAction(signIn)

  if (status === "loading") return <Skeleton className="h-screen w-full" />
  // Covers both an already-signed-in visit and the moment right after a successful sign-in.
  if (status === "authenticated") return <Navigate to={safeNext(params.get("next")) ?? homeFor(role)} replace />

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    try {
      await action.run(email, password)
    } catch (caught) {
      setError(caught instanceof ApiError && caught.status === 401 ? INCORRECT : GENERIC)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-app px-4 py-8">
      <div className="w-full max-w-[400px] rounded-modal bg-surface p-8 shadow-modal">
        <BrandMark size={40} />
        <h1 className="mt-5 font-display text-[22px] font-semibold text-ink">Welcome back</h1>
        <p className="mt-1 text-[14px] text-ink-muted">Sign in to your agency workspace</p>
        <form className="mt-6 flex flex-col gap-4" onSubmit={onSubmit} noValidate>
          <Field label="Email">
            <Input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
          <div className="-mt-2 text-right">
            <span role="link" aria-disabled="true" className="text-[13px] text-ink-faint">
              Forgot?
            </span>
          </div>
          {error && (
            <p role="alert" className="text-[13px] font-medium text-danger-text">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" pending={action.pending}>
            Sign in
          </Button>
        </form>
        <p className="mt-6 text-center text-[13px] text-ink-muted">
          New agency?{" "}
          <Link to="/signup" className="font-semibold text-brand-text">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  )
}

import { LinkButton } from "@/components/ui/Button"

/** Fallback for unmatched routes; renders inside the shell on authenticated paths. */
export function NotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="font-display text-[22px] font-semibold text-ink">Page not found</h1>
      <p className="text-[14px] text-ink-muted">The page you are looking for does not exist.</p>
      <LinkButton to="/" variant="secondary" className="mt-2">
        Go home
      </LinkButton>
    </div>
  )
}

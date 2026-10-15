import { Button } from "./Button"

export function ErrorState({
  message,
  onRetry,
  title = "Something went wrong",
  className = "",
}: {
  message: string
  onRetry?: () => void
  title?: string
  className?: string
}) {
  return (
    <div
      role="alert"
      className={`flex flex-col items-center justify-center gap-3 rounded-card border border-danger-border bg-danger-bg px-6 py-10 text-center ${className}`}
    >
      <p className="font-display text-[16px] font-semibold text-ink">{title}</p>
      <p className="text-[13px] text-danger-text">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  )
}

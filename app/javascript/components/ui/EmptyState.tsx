import type { ReactNode } from "react"

export function EmptyState({
  title,
  body,
  action,
  className = "",
}: {
  title: string
  body?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 rounded-card border border-line bg-surface px-6 py-10 text-center ${className}`}
    >
      <p className="font-display text-[16px] font-semibold text-ink">{title}</p>
      {body && <p className="max-w-[46ch] text-[13px] text-ink-muted">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

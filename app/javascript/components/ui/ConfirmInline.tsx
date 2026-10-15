import { Button } from "./Button"

export function ConfirmInline({
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
  pending = false,
  onConfirm,
  onCancel,
  className = "",
}: {
  message: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: "danger" | "brand"
  pending?: boolean
  onConfirm: () => void
  onCancel: () => void
  className?: string
}) {
  return (
    <div
      role="group"
      className={`flex flex-col gap-3 rounded-card border border-warning-border bg-warning-bg p-3 md:flex-row md:items-center md:justify-between ${className}`}
    >
      <p className="text-[13px] font-medium text-ink">{message}</p>
      <div className="flex shrink-0 gap-2">
        <Button variant="secondary" size="sm" onClick={onCancel} disabled={pending}>
          {cancelLabel}
        </Button>
        <Button variant={tone === "danger" ? "danger" : "primary"} size="sm" onClick={onConfirm} pending={pending}>
          {confirmLabel}
        </Button>
      </div>
    </div>
  )
}

import { useRef, useState } from "react"
import type { KeyboardEvent } from "react"

function matchesAccept(file: File, accept: string): boolean {
  const parts = accept
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
  if (parts.length === 0) return true
  return parts.some((part) => {
    if (part.startsWith(".")) return file.name.toLowerCase().endsWith(part)
    if (part.endsWith("/*")) return file.type.toLowerCase().startsWith(part.slice(0, -1))
    return file.type.toLowerCase() === part
  })
}

export function Dropzone({
  accept = ".csv",
  multiple = false,
  label,
  ariaLabel,
  disabled = false,
  onFiles,
  onRejected,
  className = "",
}: {
  accept?: string
  multiple?: boolean
  label: string
  ariaLabel: string
  disabled?: boolean
  onFiles: (files: File[]) => void
  onRejected?: (files: File[]) => void
  className?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)

  const deliver = (list: FileList | null) => {
    if (!list || list.length === 0) return
    const files = Array.from(list)
    const accepted = files.filter((file) => matchesAccept(file, accept))
    const rejected = files.filter((file) => !matchesAccept(file, accept))
    if (rejected.length > 0) onRejected?.(rejected)
    if (accepted.length > 0) onFiles(accepted)
  }

  const openPicker = () => {
    if (!disabled) inputRef.current?.click()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return
    event.preventDefault()
    openPicker()
  }

  return (
    <div
      role="button"
      data-testid="dropzone"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      onClick={openPicker}
      onKeyDown={onKeyDown}
      onDragOver={(event) => {
        if (disabled) return
        event.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => {
        if (!disabled) setOver(false)
      }}
      onDrop={(event) => {
        if (disabled) return
        event.preventDefault()
        setOver(false)
        deliver(event.dataTransfer.files)
      }}
      className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-card border-2 border-dashed px-6 py-8 text-center transition-colors ${
        over ? "border-brand bg-brand-tint" : "border-line-strong bg-surface"
      } ${disabled ? "cursor-not-allowed opacity-50" : ""} ${className}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        aria-label={ariaLabel}
        className="sr-only"
        onChange={(event) => {
          deliver(event.target.files)
          event.target.value = ""
        }}
      />
      <p className="text-[14px] font-medium text-ink">{label}</p>
      <p className="text-[12px] text-ink-muted">or click to browse</p>
    </div>
  )
}

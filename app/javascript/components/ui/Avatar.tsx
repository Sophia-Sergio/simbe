const SIZES: Record<26 | 30 | 36 | 44, string> = {
  26: "h-[26px] w-[26px] text-[10px]",
  30: "h-[30px] w-[30px] text-[11px]",
  36: "h-9 w-9 text-[12px]",
  44: "h-11 w-11 text-[14px]",
}

export type AvatarTone = "brand" | "success" | "warning" | "violet" | "danger"

const TONES: Record<AvatarTone, string> = {
  brand: "bg-brand-tint text-brand-text",
  success: "bg-success-bg text-success-text",
  warning: "bg-warning-bg text-warning-text",
  violet: "bg-violet-bg text-violet-text",
  danger: "bg-danger-bg text-danger-text",
}

const ORDER: AvatarTone[] = ["brand", "success", "warning", "violet", "danger"]

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

/** Stable tone for a name, so the same person always gets the same tint. */
export function avatarTone(name: string): AvatarTone {
  let hash = 0
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) | 0
  return ORDER[Math.abs(hash) % ORDER.length]
}

export function Avatar({
  name,
  size = 36,
  tone,
  className = "",
}: {
  name: string
  size?: 26 | 30 | 36 | 44
  tone?: AvatarTone
  className?: string
}) {
  return (
    <span
      title={name || undefined}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${SIZES[size]} ${
        TONES[tone ?? avatarTone(name)]
      } ${className}`}
    >
      {initials(name)}
    </span>
  )
}

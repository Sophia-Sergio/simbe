import { formatInt } from "@/lib/format"

export type UploadPhase = "storing" | "parsing" | "validating" | "importing" | "computing" | "finalizing"

export type UploadProgressValue = {
  phase?: UploadPhase | string
  pct?: number | null
  rows_done?: number | null
  rows_total?: number | null
}

const PHASE_LABELS: Record<UploadPhase, string> = {
  storing: "Uploading your files",
  parsing: "Reading your files",
  validating: "Checking your data",
  importing: "Importing rows",
  computing: "Building your insights",
  finalizing: "Almost done",
}

function phaseLabel(phase: string, progress: UploadProgressValue | null | undefined): string {
  if (phase === "importing" && progress?.rows_done != null && progress?.rows_total != null) {
    return `Importing rows (${formatInt(progress.rows_done)} of ${formatInt(progress.rows_total)})`
  }
  return PHASE_LABELS[phase as UploadPhase] ?? "Working…"
}

/** An upload `status` doubles as a phase only when it names one; otherwise start at storing. */
function resolvePhase(status: string | undefined, progress: UploadProgressValue | null | undefined): string {
  if (progress?.phase) return progress.phase
  if (status && status in PHASE_LABELS) return status
  return "storing"
}

/** Phase label + bar for the async snapshot load; shimmer when the pct is unknown. */
export function UploadProgress({
  status,
  progress,
}: {
  status?: string
  progress?: UploadProgressValue | null
}) {
  const phase = resolvePhase(status, progress)
  const label = phaseLabel(phase, progress)
  const pct = progress?.pct
  const determined = typeof pct === "number"
  const clamped = determined ? Math.max(0, Math.min(100, pct as number)) : 0

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={determined ? 0 : undefined}
      aria-valuemax={determined ? 100 : undefined}
      aria-valuenow={determined ? clamped : undefined}
      className="flex w-full flex-col gap-1.5"
    >
      <span className="text-[13px] text-ink-secondary">{label}</span>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-subtle">
        {determined ? (
          <span className="block h-full rounded-full bg-brand" style={{ width: `${clamped}%` }} />
        ) : (
          <span data-testid="indeterminate" className="block h-full w-1/3 animate-pulse rounded-full bg-brand" />
        )}
      </div>
    </div>
  )
}

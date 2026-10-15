import { CircleCheck, CircleX, TriangleAlert } from "lucide-react"
import { formatInt } from "@/lib/format"

export type ReportError = { code: string; file?: string | null; row?: number | null; message: string }
export type ReportWarning = { code: string; count: number; message: string }
export type ReportCounts = { current: number; incoming: number; delta: number }
export type Report = {
  ok: boolean
  errors: ReportError[]
  warnings: ReportWarning[]
  ignored?: string[]
  diff?: { leads?: ReportCounts } & Record<string, ReportCounts | undefined>
  checks?: { files_matched?: string; duplicates?: number; screener_encrypted?: boolean }
  as_of?: string
}

function signedDelta(delta: number): string {
  return `${delta >= 0 ? "+" : "−"}${formatInt(Math.abs(delta))}`
}

function errorLabel(error: ReportError): string {
  const where = error.file ? `${error.file}${error.row != null ? ` row ${error.row}` : ""} · ` : ""
  return `${where}${error.message}`
}

/** Upload validation report: green checks, amber warnings, red errors. */
export function ReviewReport({ report, agencyName }: { report: Report; agencyName: string }) {
  const leads = report.diff?.leads
  const checks = report.checks
  const duplicates = checks?.duplicates
  const encrypted = checks?.screener_encrypted

  return (
    <div className="flex flex-col gap-2 text-[13px]">
      <ul className="flex flex-col gap-1.5">
        {leads ? (
          <li className="flex items-start gap-2">
            <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-success-text" />
            <span className="text-ink-secondary">{`Leads ${formatInt(leads.current)} → ${formatInt(leads.incoming)} (${signedDelta(leads.delta)})`}</span>
          </li>
        ) : null}
        {duplicates !== undefined ? (
          <li className="flex items-start gap-2">
            <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-success-text" />
            <span className="text-ink-secondary">{`Duplicate rows ${formatInt(duplicates)}`}</span>
          </li>
        ) : null}
        {checks?.files_matched ? (
          <li className="flex items-start gap-2">
            <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-success-text" />
            <span className="text-ink-secondary">{`Files matched to ${agencyName} ${checks.files_matched}`}</span>
          </li>
        ) : null}
        {encrypted !== undefined ? (
          <li className="flex items-start gap-2">
            <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-success-text" />
            <span className="text-ink-secondary">{`Screener answers ${encrypted ? "Encrypted" : "Not encrypted"}`}</span>
          </li>
        ) : null}
      </ul>

      {report.warnings.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {report.warnings.map((warning) => (
            <li key={`${warning.code}-${warning.message}`} className="flex items-start gap-2">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning-text" />
              <span className="text-warning-text">{`${warning.message} (${formatInt(warning.count)})`}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {report.errors.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {report.errors.map((error) => (
            <li key={`${error.code}-${error.file ?? ""}-${error.row ?? ""}`} className="flex items-start gap-2">
              <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-danger-text" />
              <span className="text-danger-text">{errorLabel(error)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

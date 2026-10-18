import type { ReactNode } from "react"
import { CircleCheck, CircleX, TriangleAlert } from "lucide-react"
import { formatInt } from "@/lib/format"

// Local shape of the upload validation report. There is no `app/javascript/api` yet
// (W0-2/W0-5); replace this with the generated types once they exist — see
// contracts/openapi/schemas/snapshots.yaml (`UploadReport`).
type ReportError = { code: string; file?: string | null; row?: number | null; message: string }
type ReportWarning = { code: string; count: number; message: string }
type ReportCounts = { current: number; incoming: number; delta: number }
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

/** A check row: green check when the check passed, red cross when it failed. */
function CheckRow({ ok, children }: { ok: boolean; children: ReactNode }) {
  const Icon = ok ? CircleCheck : CircleX
  const tone = ok ? "text-success-text" : "text-danger-text"
  return (
    <li className="flex items-start gap-2">
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone}`} />
      <span className={ok ? "text-ink-secondary" : "text-danger-text"}>{children}</span>
    </li>
  )
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
          <CheckRow ok>
            {`Leads ${formatInt(leads.current)} → ${formatInt(leads.incoming)} (${signedDelta(leads.delta)})`}
          </CheckRow>
        ) : null}
        {/* Duplicates are not a failure (we keep one of each): when there are some, the warnings below name each file. */}
        {duplicates === 0 ? <CheckRow ok>Duplicate rows 0</CheckRow> : null}
        {checks?.files_matched ? (
          <CheckRow ok={checks.files_matched.trim() === "7 of 7"}>
            {`Files matched to ${agencyName} ${checks.files_matched}`}
          </CheckRow>
        ) : null}
        {encrypted !== undefined ? (
          <CheckRow ok={encrypted === true}>{`Screener answers ${encrypted ? "Encrypted" : "Not encrypted"}`}</CheckRow>
        ) : null}
      </ul>

      {report.warnings.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {report.warnings.map((warning) => (
            <li key={`${warning.code}-${warning.message}`} className="flex items-start gap-2">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning-text" />
              <span className="text-warning-text">
                {/* The duplicate-rows message already says how many. */}
                {warning.code === "duplicate_rows_dropped" ? warning.message : `${warning.message} (${formatInt(warning.count)})`}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {report.errors.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {report.errors.map((error, index) => (
            <li key={`${error.code}-${error.file ?? ""}-${error.row ?? ""}-${index}`} className="flex items-start gap-2">
              <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-danger-text" />
              <span className="text-danger-text">{errorLabel(error)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

import { useState } from "react"
import { CircleCheck, ShieldCheck } from "lucide-react"
import type { ApiError } from "@/api/client"
import { useCurrentSnapshot, useSnapshotUpload } from "@/api/hooks/snapshots"
import { EXPORT_FILES, FileChecklist } from "@/components/shared/FileChecklist"
import { ReviewReport } from "@/components/shared/ReviewReport"
import { UploadProgress } from "@/components/shared/UploadProgress"
import { Button } from "@/components/ui/Button"
import { Dropzone } from "@/components/ui/Dropzone"
import { useAsyncAction } from "@/hooks/useAsyncAction"

function errorMessage(error: ApiError | null): string {
  if (!error) return "We could not load your data. Try again."
  if (error.code === "already_in_progress") return "A load is already running"
  return error.message
}

/**
 * Step 4: load the seven CSV exports. The upload is asynchronous (Lakeside is 69 MB / ~625k rows):
 * dropzone → validating → review → commit → done. The wizard may move on at any time; the load keeps
 * running in the background and a reload resumes it through `useCurrentSnapshot().pending`.
 */
export function LoadDataStep({ agencyName, onSkip }: { agencyName: string; onSkip: () => void }) {
  const upload = useSnapshotUpload()
  const snapshot = useCurrentSnapshot()
  const [rejected, setRejected] = useState<File[]>([])
  const load = useAsyncAction(() => upload.commit())

  const statuses = Object.fromEntries((snapshot.data?.files ?? []).map((file) => [file.name, file.rows]))
  const ignored = [...(upload.report?.ignored ?? []), ...rejected.map((file) => file.name)]

  return (
    <div className="flex flex-col gap-4">
      {upload.state === "idle" ? (
        <Dropzone
          ariaLabel="CSV files"
          label={`Drop your ${EXPORT_FILES.length} CSV exports`}
          multiple
          accept=".csv"
          onFiles={(files) => void upload.upload(files)}
          onRejected={(files) => setRejected((previous) => [...previous, ...files])}
        />
      ) : null}

      {upload.state === "uploading" || upload.state === "validating" ? (
        <UploadProgress status={upload.state === "uploading" ? "storing" : "validating"} progress={upload.progress} />
      ) : null}

      {upload.state === "review" ? (
        <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
          <h3 className="text-[14px] font-semibold text-ink">Review changes</h3>
          {upload.report ? <ReviewReport report={upload.report} agencyName={agencyName} /> : null}
          <Button
            className="self-start"
            disabled={upload.report?.ok === false}
            pending={load.pending}
            onClick={() => void load.run()}
          >
            Load data
          </Button>
        </div>
      ) : null}

      {upload.state === "committing" ? <UploadProgress status="committing" progress={upload.progress} /> : null}

      {upload.state === "done" ? (
        <p className="flex items-center gap-2 text-[14px] font-medium text-ink">
          <CircleCheck aria-hidden className="h-5 w-5 text-success-text" />
          Your data is loaded
        </p>
      ) : null}

      {upload.state === "error" ? (
        <div className="flex flex-col items-start gap-2">
          <p role="alert" className="text-[13px] font-medium text-danger-text">
            {errorMessage(upload.error)}
          </p>
          <Button variant="secondary" onClick={() => upload.reset()}>
            Try again
          </Button>
        </div>
      ) : null}

      {ignored.length > 0 ? <p className="text-[12px] text-warning-text">Ignored: {ignored.join(", ")}</p> : null}

      <FileChecklist present={upload.files} statuses={upload.state === "done" ? statuses : undefined} />

      <p className="flex items-center gap-2 text-[12px] text-ink-muted">
        <ShieldCheck aria-hidden className="h-4 w-4 text-success-text" />
        Screener answers are encrypted
      </p>

      <button type="button" onClick={onSkip} className="self-start text-[13px] font-semibold text-brand-text">
        Skip for now
      </button>
    </div>
  )
}

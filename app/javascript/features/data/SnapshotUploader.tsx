import { FileChecklist } from "@/components/shared/FileChecklist"
import { Dropzone } from "@/components/ui/Dropzone"

/**
 * Dropzone + file picker for the seven CSV exports (detail reference `2012` Task 4). Shared by the
 * data-sources modal and (in the wizard lane) the "load data" step: the parent owns the upload flow
 * (`useSnapshotUpload`) and passes the chosen files back through `onFiles`.
 *
 * Files matched by basename get a row from `FileChecklist`; anything else the picker accepted (e.g. a
 * `.csv` with an unexpected name) is listed under "Ignored".
 */
export function SnapshotUploader({
  present = [],
  statuses,
  ignored = [],
  disabled = false,
  onFiles,
  onRejected,
}: {
  present?: string[]
  statuses?: Record<string, number>
  ignored?: string[]
  disabled?: boolean
  onFiles: (files: File[]) => void
  onRejected?: (files: File[]) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <Dropzone
        accept=".csv"
        multiple
        label="Drop your 7 CSV exports"
        ariaLabel="CSV files"
        disabled={disabled}
        onFiles={onFiles}
        onRejected={onRejected}
      />
      <p className="text-[12px] text-ink-muted">Any order — files are matched by name, not position.</p>
      <FileChecklist present={present} statuses={statuses} />
      {ignored.length > 0 ? <p className="text-[12px] text-ink-muted">{`Ignored: ${ignored.join(", ")}`}</p> : null}
    </div>
  )
}

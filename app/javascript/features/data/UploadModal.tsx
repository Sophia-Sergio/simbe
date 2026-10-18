import { useEffect, useRef, useState } from "react"
import { X } from "lucide-react"
import { useSnapshotUpload } from "@/api/hooks/snapshots"
import { ReviewReport } from "@/components/shared/ReviewReport"
import type { Report as UiReport } from "@/components/shared/ReviewReport"
import { UploadProgress } from "@/components/shared/UploadProgress"
import { Button } from "@/components/ui/Button"
import { FileChecklist } from "@/components/shared/FileChecklist"
import { Modal } from "@/components/ui/Modal"
import { useToast } from "@/components/ui/Toast"
import { useAsyncAction } from "@/hooks/useAsyncAction"
import { SnapshotUploader } from "./SnapshotUploader"

const ALREADY_RUNNING = "A load is already running — it will finish on its own."

// Announced through a live region so screen-reader users hear every phase of the async load.
const ANNOUNCEMENTS: Record<string, string> = {
  idle: "Choose your 7 CSV exports",
  uploading: "Uploading your files",
  validating: "Checking your files",
  review: "Upload validated — review before replacing",
  committing: "Replacing your snapshot",
  done: "Snapshot replaced",
  error: "Upload failed",
}

type UploadModalProps = {
  open: boolean
  onClose: () => void
  agencyName: string
}

/**
 * Upload modal (desktop) / bottom sheet (mobile) for the asynchronous snapshot load (lane override 1).
 *
 * The inner component is mounted only while `open`, so closing it stops the client's polling: the load
 * keeps running server-side and the page's "Loading your data…" card (from `snapshots/current.pending`)
 * keeps updating. Reopening mounts a fresh `useSnapshotUpload`, which resumes the pending upload it finds.
 */
export function UploadModal(props: UploadModalProps) {
  return props.open ? <UploadModalContent {...props} /> : null
}

function UploadModalContent({ onClose, agencyName }: UploadModalProps) {
  const upload = useSnapshotUpload()
  const toast = useToast()
  const [rejected, setRejected] = useState<string[]>([])
  const finished = useRef(false)

  const commitAction = useAsyncAction(upload.commit)
  const cancelAction = useAsyncAction(async () => {
    await upload.cancel()
    onClose()
  })

  const { state, files, report, progress, error } = upload

  // A single-flight commit finishes once: toast, clear the hook and let the page's invalidation show the new snapshot.
  useEffect(() => {
    if (state !== "done" || finished.current) return
    finished.current = true
    toast.show("Snapshot replaced · no duplicates counted", { tone: "success" })
    setRejected([])
    upload.reset()
    onClose()
  }, [state, toast, upload, onClose])

  // Retry starts a clean slate: a file rejected by a previous attempt must not linger as "Ignored".
  const retry = () => {
    setRejected([])
    upload.reset()
  }

  const alreadyRunning = error?.code === "already_in_progress"
  const ignored = [...rejected, ...((report as UiReport | null)?.ignored ?? [])]

  const title =
    state === "review" ? "Review changes" : state === "committing" ? "Replacing snapshot" : state === "error" ? "Upload failed" : "Upload new snapshot"

  const body = (() => {
    if (state === "review") {
      return (
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-ink-secondary">Everything checks out. Review before replacing.</p>
          <ReviewReport report={report as unknown as UiReport} agencyName={agencyName} />
          {ignored.length > 0 ? <p className="text-[12px] text-ink-muted">{`Ignored: ${ignored.join(", ")}`}</p> : null}
        </div>
      )
    }
    if (state === "uploading" || state === "validating") {
      return (
        <div className="flex flex-col gap-4">
          <UploadProgress status={state} progress={progress} />
          <FileChecklist present={files} />
        </div>
      )
    }
    if (state === "committing") {
      return <UploadProgress status="committing" progress={progress} />
    }
    if (state === "error") {
      return (
        <p role="alert" className="text-[13px] font-medium text-danger-text">
          {alreadyRunning ? ALREADY_RUNNING : (error?.message ?? "Something went wrong. Try again.")}
        </p>
      )
    }
    if (state === "done") {
      return <p className="text-[13px] text-ink-secondary">Snapshot replaced · no duplicates counted</p>
    }
    return (
      <SnapshotUploader
        present={files}
        ignored={ignored}
        onFiles={(chosen) => void upload.upload(chosen)}
        onRejected={(files) => setRejected(files.map((file) => file.name))}
      />
    )
  })()

  const footer = (() => {
    if (state === "review") {
      return (
        <>
          <Button variant="secondary" className="w-full md:w-auto" pending={cancelAction.pending} onClick={() => void cancelAction.run()}>
            Cancel
          </Button>
          <Button className="w-full md:w-auto" disabled={report?.ok === false} pending={commitAction.pending} onClick={() => void commitAction.run()}>
            Replace snapshot
          </Button>
        </>
      )
    }
    if (state === "validating") {
      return (
        <Button variant="secondary" className="w-full md:w-auto" pending={cancelAction.pending} onClick={() => void cancelAction.run()}>
          Cancel
        </Button>
      )
    }
    // Replace is already running: it cannot be cancelled (lane override 1).
    if (state === "committing") {
      return (
        <Button className="w-full md:w-auto" pending>
          Replace snapshot
        </Button>
      )
    }
    if (state === "error") {
      return (
        <>
          <Button variant="secondary" className="w-full md:w-auto" onClick={onClose}>
            Close
          </Button>
          {alreadyRunning ? null : (
            <Button className="w-full md:w-auto" onClick={retry}>
              Try again
            </Button>
          )}
        </>
      )
    }
    return null
  })()

  return (
    <Modal open onClose={onClose} title={title} footer={footer} footerClassName="flex-col-reverse md:flex-row">
      <div className="relative">
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute right-0 top-0 inline-flex h-11 w-11 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-subtle md:h-8 md:w-8"
        >
          <X aria-hidden className="h-4 w-4" />
        </button>
        <div role="status" aria-live="polite" data-testid="upload-status" className="sr-only">
          {ANNOUNCEMENTS[state] ?? ""}
        </div>
        {body}
      </div>
    </Modal>
  )
}

import { EmptyState } from "@/components/ui/EmptyState"
import { UploadProgress } from "./UploadProgress"
import type { UploadProgressValue } from "./UploadProgress"

/** Full-width "Loading your data…" state shown while a snapshot load is pending. */
export function LoadingYourData({ progress }: { progress?: UploadProgressValue | null }) {
  return (
    <div className="flex w-full flex-col gap-3">
      <EmptyState title="Loading your data…" />
      <UploadProgress status="committing" progress={progress ?? null} />
    </div>
  )
}

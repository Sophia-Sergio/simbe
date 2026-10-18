import { useCallback, useEffect, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { API, ApiError, jsonRequest, uploadFiles } from "../client"
import type { components } from "../generated/schema"
import type { SnapshotCurrent, SnapshotUpload } from "../types"

type Progress = components["schemas"]["Progress"]
type Report = components["schemas"]["Report"]

type SnapshotUploadState = "idle" | "uploading" | "validating" | "review" | "committing" | "done" | "error"

export type SnapshotUploadController = {
  state: SnapshotUploadState
  files: string[]
  progress: Progress | null
  report: Report | null
  error: ApiError | null
  upload: (files: File[]) => Promise<void>
  commit: () => Promise<void>
  cancel: () => Promise<void>
  reset: () => void
}

function asApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  return new ApiError(0, "unknown", error instanceof Error ? error.message : "Something went wrong")
}

/**
 * The latest snapshot plus any upload in flight. Refetches every 2 s while `pending` is non-null so every
 * screen's "Loading your data…" state clears itself.
 */
export function useCurrentSnapshot() {
  return useQuery({
    queryKey: ["snapshot"],
    queryFn: ({ signal }) => jsonRequest<SnapshotCurrent>("GET", `${API}/snapshots/current`, undefined, signal),
    refetchInterval: (query) => (query.state.data?.pending ? 2000 : false),
  })
}

/** Drives the whole asynchronous upload flow: upload → validating → review → committing → done. */
export function useSnapshotUpload(): SnapshotUploadController {
  const queryClient = useQueryClient()
  const [startedId, setStartedId] = useState<string | null>(null)
  const [phase, setPhase] = useState<SnapshotUploadState>("idle")
  const [files, setFiles] = useState<string[]>([])
  const [liveProgress, setLiveProgress] = useState<Progress | null>(null)
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const busy = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data: current } = useCurrentSnapshot()
  const pending = current?.pending ?? null
  const pendingId = pending?.upload_id ?? null
  // We have not started an upload of our own, but the agency has one in flight (e.g. after a reload).
  const resuming = phase === "idle" && !startedId && pendingId !== null
  const uploadId = startedId ?? pendingId
  const state: SnapshotUploadState = resuming ? (pending?.status === "committing" ? "committing" : "validating") : phase
  const progress = resuming ? (liveProgress ?? pending?.progress ?? null) : liveProgress

  const polling = state === "validating" || state === "committing"

  useEffect(() => {
    if (!uploadId || !polling) return
    let cancelled = false
    let lastPct = -1
    const tick = async () => {
      try {
        const body = await jsonRequest<SnapshotUpload>("GET", `${API}/snapshot_uploads/${uploadId}`)
        if (cancelled) return
        setStartedId((previous) => previous ?? uploadId)
        setLiveProgress(body.progress)
        setReport(body.report)
        if (body.status === "validated") {
          setPhase("review")
          return
        }
        if (body.status === "committed") {
          setPhase("done")
          void queryClient.invalidateQueries({ queryKey: ["snapshot"] })
          void queryClient.invalidateQueries({ queryKey: ["metrics"] })
          void queryClient.invalidateQueries({ queryKey: ["leads"] })
          void queryClient.invalidateQueries({ queryKey: ["next_actions"] })
          void queryClient.invalidateQueries({ queryKey: ["coordinators"] })
          return
        }
        if (body.status === "failed") {
          setError(new ApiError(500, body.error?.code ?? "failed", body.error?.message ?? "Upload failed"))
          setPhase("error")
          return
        }
        if (body.status === "cancelled" || body.status === "expired") {
          setStartedId(null)
          setPhase("idle")
          return
        }
        setPhase(body.status === "committing" ? "committing" : "validating")
        const pct = body.progress?.pct ?? -1
        const delay = pct !== lastPct ? 500 : 1000
        lastPct = pct
        timer.current = setTimeout(tick, delay)
      } catch (caught) {
        if (!cancelled) {
          setError(asApiError(caught))
          setPhase("error")
        }
      }
    }
    timer.current = setTimeout(tick, 500)
    return () => {
      cancelled = true
      if (timer.current) clearTimeout(timer.current)
    }
  }, [uploadId, polling, queryClient])

  const upload = useCallback(
    async (selected: File[]) => {
      if (busy.current) return
      busy.current = true
      setError(null)
      setReport(null)
      setLiveProgress(null)
      setFiles(selected.map((file) => file.name))
      setPhase("uploading")
      try {
        const body = await uploadFiles<SnapshotUpload>(`${API}/snapshot_uploads`, selected)
        setStartedId(body.id)
        setLiveProgress(body.progress)
        setPhase("validating")
        void queryClient.invalidateQueries({ queryKey: ["snapshot"] })
      } catch (caught) {
        setError(asApiError(caught))
        setPhase("error")
      } finally {
        busy.current = false
      }
    },
    [queryClient],
  )

  const commit = useCallback(async () => {
    if (!uploadId || busy.current) return
    busy.current = true
    try {
      const body = await jsonRequest<SnapshotUpload>("POST", `${API}/snapshot_uploads/${uploadId}/commit`)
      setLiveProgress(body.progress)
      setPhase("committing")
    } catch (caught) {
      const apiError = asApiError(caught)
      if (apiError.extra.report) setReport(apiError.extra.report as Report)
      setError(apiError)
      setPhase("error")
    } finally {
      busy.current = false
    }
  }, [uploadId])

  const cancel = useCallback(async () => {
    if (!uploadId) return
    try {
      await jsonRequest<void>("DELETE", `${API}/snapshot_uploads/${uploadId}`)
    } catch {
      /* cancelling is best-effort */
    }
    setStartedId(null)
    setPhase("idle")
    setLiveProgress(null)
    setReport(null)
    setError(null)
    void queryClient.invalidateQueries({ queryKey: ["snapshot"] })
  }, [uploadId, queryClient])

  const reset = useCallback(() => {
    setStartedId(null)
    setPhase("idle")
    setFiles([])
    setLiveProgress(null)
    setReport(null)
    setError(null)
  }, [])

  return { state, files, progress, report, error, upload, commit, cancel, reset }
}

import { HttpResponse, http } from "msw"
import uploadCommitted from "@contracts/examples/snapshots/upload-committed.json"
import uploadErrors from "@contracts/examples/snapshots/upload-errors.json"
import uploadOk from "@contracts/examples/snapshots/upload-ok.json"
import { db } from "../db"
import type { MockUpload } from "../db"
import { scenario } from "../scenarios"
import { csrfForbidden, forbidden, isOwner, notFound, unauth, uuid } from "./shared"
import type { Report, SnapshotCurrent, SnapshotUpload } from "@/api/types"

// The seven CSVs an export consists of; files with other names are reported under `ignored`.
const FILE_NAMES = [
  "leads.csv",
  "stage_history.csv",
  "contact_log.csv",
  "screener_answers.csv",
  "web_sessions.csv",
  "appointments.csv",
  "applications.csv",
]

const ROWS_TOTAL = 52000

function gate(): Response | null {
  if (!db.session) return unauth()
  if (!isOwner()) return forbidden()
  return null
}

function buildReport(files: string[]): Report {
  const present = new Set(files)
  const ignored = files.filter((name) => !FILE_NAMES.includes(name))
  const missing = FILE_NAMES.filter((name) => !present.has(name))
  if (missing.length === 0) {
    const report = structuredClone(uploadOk.report) as Report
    report.ignored = ignored
    return report
  }
  const report = structuredClone(uploadErrors.report) as Report
  report.ok = false
  report.errors = missing.map((name) => ({ code: "missing_file", file: name, row: null, message: `${name} was not uploaded` }))
  report.ignored = ignored
  report.checks = { ...report.checks, files_matched: `${FILE_NAMES.length - missing.length} of ${FILE_NAMES.length}` }
  return report
}

/** The pending banner shown by `GET /snapshots/current` while an upload validates or commits. */
function activePending(): SnapshotCurrent["pending"] {
  for (const [id, upload] of db.uploads) {
    if (upload.status === "validating" || upload.status === "committing") {
      return { upload_id: id, status: upload.status, progress: upload.progress }
    }
  }
  return null
}

function body(id: string, upload: MockUpload): SnapshotUpload {
  return {
    id,
    status: upload.status,
    progress: upload.progress,
    report: upload.report,
    snapshot: upload.snapshot,
    error: null,
  }
}

/** Advances the upload's polling state machine one GET and returns the new body. */
function advance(id: string, upload: MockUpload): SnapshotUpload {
  if (upload.status === "validating") {
    upload.polls += 1
    if (upload.polls === 1) {
      upload.progress = { phase: "storing", pct: 30 }
      return body(id, upload)
    }
    if (upload.polls === 2) {
      upload.progress = { phase: "parsing", pct: 65 }
      return body(id, upload)
    }
    if (upload.polls === 3) {
      upload.progress = { phase: "validating", pct: 90 }
      return body(id, upload)
    }
    upload.report = buildReport(upload.files)
    upload.status = "validated"
    upload.progress = null
    return body(id, upload)
  }
  if (upload.status === "committing") {
    upload.commitPolls += 1
    const pcts = [10, 40, 70, 100]
    if (upload.commitPolls <= pcts.length) {
      const pct = pcts[upload.commitPolls - 1]
      upload.progress = { phase: pct <= 40 ? "importing" : "computing", pct, rows_done: Math.round((ROWS_TOTAL * pct) / 100), rows_total: ROWS_TOTAL }
      return body(id, upload)
    }
    const snapshot = structuredClone(uploadCommitted.snapshot)
    upload.snapshot = snapshot
    upload.status = "committed"
    upload.progress = null
    db.snapshot = {
      snapshot,
      pending: null,
      files: [
        { name: "leads.csv", rows: 3611 },
        { name: "stage_history.csv", rows: 9262 },
        { name: "contact_log.csv", rows: 10451 },
        { name: "screener_answers.csv", rows: 35305 },
        { name: "web_sessions.csv", rows: 9906 },
        { name: "appointments.csv", rows: 647 },
        { name: "applications.csv", rows: 923 },
      ],
    }
    return body(id, upload)
  }
  return body(id, upload)
}

export const snapshotHandlers = [
  // Asynchronous like the real API: store the file names and return validating immediately.
  http.post("/api/v1/snapshot_uploads", async ({ request }) => {
    const csrf = csrfForbidden(request)
    if (csrf) return csrf
    const gated = gate()
    if (gated) return gated
    const form = await request.formData().catch(() => null)
    const files: string[] = []
    if (form) for (const [key, value] of form.entries()) if ((key === "files" || key === "files[]") && typeof value !== "string") files.push(value.name)
    const id = uuid()
    db.uploads.set(id, { files, report: null, status: "validating", progress: { phase: "storing", pct: 0 }, polls: 0, commitPolls: 0, commits: 0, snapshot: null })
    return HttpResponse.json({ id, status: "validating", progress: { phase: "storing", pct: 0 }, report: null, snapshot: null, error: null } satisfies SnapshotUpload, { status: 201 })
  }),

  http.get("/api/v1/snapshot_uploads/:id", ({ params }) => {
    const gated = gate()
    if (gated) return gated
    const id = String(params.id)
    const upload = db.uploads.get(id)
    if (!upload) return notFound()
    return HttpResponse.json(advance(id, upload))
  }),

  // Cancel marks the upload cancelled (not deleted) so a poll racing the cancel sees the terminal state.
  http.delete("/api/v1/snapshot_uploads/:id", ({ request, params }) => {
    const csrf = csrfForbidden(request)
    if (csrf) return csrf
    const gated = gate()
    if (gated) return gated
    const upload = db.uploads.get(String(params.id))
    if (!upload) return notFound()
    upload.status = "cancelled"
    upload.progress = null
    return new HttpResponse(null, { status: 204 })
  }),

  http.post("/api/v1/snapshot_uploads/:id/commit", ({ request, params }) => {
    const csrf = csrfForbidden(request)
    if (csrf) return csrf
    const gated = gate()
    if (gated) return gated
    const id = String(params.id)
    const upload = db.uploads.get(id)
    if (!upload) return notFound()
    if (!upload.report) return HttpResponse.json({ error: { code: "not_validated", message: "Validation has not finished" } }, { status: 409 })
    if (!upload.report.ok) {
      return HttpResponse.json({ error: { code: "invalid_snapshot", message: "The upload has errors" }, report: upload.report }, { status: 422 })
    }
    const busy = [...db.uploads.values()].some((other) => other.status === "committing")
    if (busy || (scenario === "slow" && upload.commits > 0)) {
      return HttpResponse.json({ error: { code: "already_in_progress", message: "A load is already running" } }, { status: 409 })
    }
    upload.commits += 1
    upload.commitPolls = 0
    upload.status = "committing"
    upload.progress = { phase: "importing", pct: 10, rows_done: Math.round(ROWS_TOTAL / 10), rows_total: ROWS_TOTAL }
    return HttpResponse.json(body(id, upload), { status: 202 })
  }),

  // Any role: the pending banner drives "Loading your data…" on every screen. A real in-flight upload wins;
  // otherwise the scenario fixture's `pending` (e.g. ?mock=loading) is preserved.
  http.get("/api/v1/snapshots/current", () => {
    if (!db.session) return unauth()
    return HttpResponse.json({ ...db.snapshot, pending: activePending() ?? db.snapshot.pending } satisfies SnapshotCurrent)
  }),
]

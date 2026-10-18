import { useState } from "react"
import { act, fireEvent, screen, within } from "@testing-library/react"
import { HttpResponse } from "msw"
import uploadCommitted from "@contracts/examples/snapshots/upload-committed.json"
import uploadErrors from "@contracts/examples/snapshots/upload-errors.json"
import uploadOk from "@contracts/examples/snapshots/upload-ok.json"
import { mockApi } from "@/test/mockApi"
import { renderWithProviders } from "@/test/renderWithProviders"
import { UploadModal } from "./UploadModal"

const EXPORT_FILES = [
  "leads.csv",
  "stage_history.csv",
  "contact_log.csv",
  "screener_answers.csv",
  "web_sessions.csv",
  "appointments.csv",
  "applications.csv",
]
const SIX = EXPORT_FILES.filter((name) => name !== "appointments.csv")

const ID = "66666666-6666-4666-8666-666666666666"
const created = { id: ID, status: "validating", progress: { phase: "storing", pct: 0 }, report: null, snapshot: null, error: null }
const validating = (polls: number) => ({
  id: ID,
  status: "validating",
  progress: { phase: polls >= 3 ? "validating" : polls === 2 ? "parsing" : "storing", pct: polls * 30 },
  report: null,
  snapshot: null,
  error: null,
})
const validatedWith = (report: unknown) => ({ id: ID, status: "validated", progress: null, report, snapshot: null, error: null })
const committing = (pct: number) => ({
  id: ID,
  status: "committing",
  progress: { phase: "importing", pct, rows_done: 100, rows_total: 1000 },
  report: uploadOk.report,
  snapshot: null,
  error: null,
})
const committed = { id: ID, status: "committed", progress: null, report: uploadOk.report, snapshot: uploadCommitted.snapshot, error: null }

/** Script the validating polls (1→3) then a validated report, so the flow is deterministic. */
function mockValidation(report: unknown) {
  let polls = 0
  mockApi({
    "POST /api/v1/snapshot_uploads": created,
    [`GET /api/v1/snapshot_uploads/${ID}`]: () => {
      polls += 1
      return HttpResponse.json(polls >= 4 ? validatedWith(report) : validating(polls))
    },
  })
}

const csv = (name: string) => new File(["a,b\n1,2\n"], name, { type: "text/csv" })

// A fake-timer test that hangs must never leave fake timers on for the rest of the file.
afterEach(() => vi.useRealTimers())

async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

function pick(names: string[]) {
  act(() => {
    fireEvent.change(screen.getByLabelText("CSV files"), { target: { files: names.map(csv) } })
  })
}

/** A host that really unmounts the modal on close, like `DataSourcesPage` does. */
function Host({ agencyName = "Harbor Surrogacy" }: { agencyName?: string }) {
  const [open, setOpen] = useState(true)
  return (
    <>
      <button onClick={() => setOpen(true)}>reopen</button>
      <UploadModal open={open} onClose={() => setOpen(false)} agencyName={agencyName} />
    </>
  )
}

it("walks dropzone → validating → review and commits with the toast", async () => {
  vi.useFakeTimers()
  const onClose = vi.fn()
  mockValidation(uploadOk.report)
  renderWithProviders(<UploadModal open onClose={onClose} agencyName="Harbor Surrogacy" />)

  expect(screen.getByRole("dialog")).toHaveTextContent("Drop your 7 CSV exports")

  pick(EXPORT_FILES)
  await flush(0)
  // Validating: the progress line plus the per-file checklist.
  expect(within(screen.getByRole("dialog")).getByRole("progressbar")).toBeInTheDocument()
  expect(screen.getByText("leads.csv")).toBeInTheDocument()

  await flush(4000)
  expect(screen.getByText("Review changes")).toBeInTheDocument()
  expect(screen.getByText("Leads 3,530 → 3,611 (+81)")).toBeInTheDocument()
  expect(screen.getByText("Files matched to Harbor Surrogacy 7 of 7")).toBeInTheDocument()
  expect(screen.getByText("Screener answers Encrypted")).toBeInTheDocument()

  let commitPolls = 0
  mockApi({
    "POST /api/v1/snapshot_uploads/:id/commit": () => HttpResponse.json(committing(10), { status: 202 }),
    [`GET /api/v1/snapshot_uploads/${ID}`]: () => {
      commitPolls += 1
      return HttpResponse.json(commitPolls >= 3 ? committed : committing(commitPolls * 40))
    },
  })
  fireEvent.click(screen.getByRole("button", { name: "Replace snapshot" }))
  await flush(0)
  expect(screen.getByRole("progressbar")).toBeInTheDocument()

  await flush(4000)
  expect(screen.getByTestId("toast")).toHaveTextContent("Snapshot replaced · no duplicates counted")
  expect(onClose).toHaveBeenCalled()
})

it("blocks Replace and lists errors when the report has errors", async () => {
  vi.useFakeTimers()
  mockValidation(uploadErrors.report)
  renderWithProviders(<UploadModal open onClose={() => {}} agencyName="Harbor Surrogacy" />)

  pick(SIX)
  await flush(4000)

  expect(screen.getByText("Review changes")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Replace snapshot" })).toBeDisabled()
  expect(screen.getByText(/leads\.csv row 7/)).toBeInTheDocument()
  expect(screen.getByText(/appointments\.csv was not uploaded/)).toBeInTheDocument()
})

it("Cancel during review cancels the upload and closes the modal", async () => {
  vi.useFakeTimers()
  let cancelled: string | null = null
  mockValidation(uploadOk.report)
  mockApi({
    "DELETE /api/v1/snapshot_uploads/:id": (request: Request) => {
      cancelled = new URL(request.url).pathname
      return new HttpResponse(null, { status: 204 })
    },
  })
  renderWithProviders(<Host />)

  pick(EXPORT_FILES)
  await flush(4000)
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
  await flush(0)

  expect(cancelled).toMatch(/^\/api\/v1\/snapshot_uploads\//)
  expect(screen.queryByRole("dialog")).toBeNull()
})

it("Cancel during validating cancels the in-flight upload", async () => {
  vi.useFakeTimers()
  let cancelled = false
  mockValidation(uploadOk.report)
  mockApi({
    "DELETE /api/v1/snapshot_uploads/:id": () => {
      cancelled = true
      return new HttpResponse(null, { status: 204 })
    },
  })
  renderWithProviders(<Host />)

  pick(EXPORT_FILES)
  await flush(0)
  expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
  await flush(0)
  expect(cancelled).toBe(true)
  expect(screen.queryByRole("dialog")).toBeNull()
})

it("Replace is single-flight and maps a 409 to the already-running message", async () => {
  vi.useFakeTimers()
  let commits = 0
  let release: (() => void) | null = null
  mockValidation(uploadOk.report)
  mockApi({
    "POST /api/v1/snapshot_uploads/:id/commit": async () => {
      commits += 1
      // Stay in flight so the second click is guarded, not merely raced.
      await new Promise<void>((resolve) => {
        release = resolve
      })
      return HttpResponse.json({ error: { code: "already_in_progress", message: "A load is already running" } }, { status: 409 })
    },
  })
  renderWithProviders(<UploadModal open onClose={() => {}} agencyName="Harbor Surrogacy" />)

  pick(EXPORT_FILES)
  await flush(4000)

  const replace = screen.getByRole("button", { name: "Replace snapshot" })
  fireEvent.click(replace)
  fireEvent.click(replace)
  await flush(0)
  expect(commits).toBe(1)

  act(() => release?.())
  await flush(0)
  expect(screen.getByRole("alert")).toHaveTextContent("A load is already running — it will finish on its own.")
  expect(screen.queryByRole("button", { name: "Try again" })).toBeNull()
})

it("shows a failed load's message with a Try again button", async () => {
  vi.useFakeTimers()
  mockApi({
    "POST /api/v1/snapshot_uploads": () => HttpResponse.json({ error: { code: "failed", message: "We couldn't read your files" } }, { status: 500 }),
  })
  renderWithProviders(<UploadModal open onClose={() => {}} agencyName="Harbor Surrogacy" />)

  pick(EXPORT_FILES)
  await flush(0)

  expect(screen.getByRole("alert")).toHaveTextContent("We couldn't read your files")
  fireEvent.click(screen.getByRole("button", { name: "Try again" }))
  expect(screen.getByText("Drop your 7 CSV exports")).toBeInTheDocument()
})

it("closing mid-load stops polling; reopening resumes the same upload", async () => {
  vi.useFakeTimers()
  renderWithProviders(<Host />)

  pick(EXPORT_FILES)
  await flush(0)
  expect(screen.getByRole("progressbar")).toBeInTheDocument()

  fireEvent.click(screen.getByRole("button", { name: "Close" }))
  expect(screen.queryByRole("dialog")).toBeNull()

  fireEvent.click(screen.getByRole("button", { name: "reopen" }))
  expect(screen.getByRole("dialog")).toBeInTheDocument()

  await flush(4000)
  expect(screen.getByText("Review changes")).toBeInTheDocument()
})

it("is a bottom sheet under 860px", () => {
  renderWithProviders(<UploadModal open onClose={() => {}} agencyName="Harbor Surrogacy" />, { viewport: 390 })
  expect(screen.getByRole("dialog")).toHaveAttribute("data-variant", "sheet")
})

it("announces the upload phases through a live status region", async () => {
  vi.useFakeTimers()
  mockValidation(uploadOk.report)
  renderWithProviders(<UploadModal open onClose={() => {}} agencyName="Harbor Surrogacy" />)

  const status = screen.getByTestId("upload-status")
  expect(status).toHaveAttribute("role", "status")
  expect(status).toHaveTextContent("Choose your 7 CSV exports")

  pick(EXPORT_FILES)
  await flush(0)
  expect(screen.getByTestId("upload-status")).toHaveTextContent(/Checking your files|Uploading your files/)

  await flush(4000)
  expect(screen.getByTestId("upload-status")).toHaveTextContent("Upload validated — review before replacing")
})

it("clears a rejected file once the user retries", async () => {
  vi.useFakeTimers()
  mockApi({
    "POST /api/v1/snapshot_uploads": () => HttpResponse.json({ error: { code: "failed", message: "boom" } }, { status: 500 }),
  })
  renderWithProviders(<UploadModal open onClose={() => {}} agencyName="Harbor Surrogacy" />)

  act(() => {
    fireEvent.change(screen.getByLabelText("CSV files"), {
      target: { files: [...EXPORT_FILES.map(csv), new File(["notes"], "notes.docx")] },
    })
  })
  await flush(0)
  expect(screen.getByRole("alert")).toBeInTheDocument()

  fireEvent.click(screen.getByRole("button", { name: "Try again" }))
  expect(screen.getByText("Drop your 7 CSV exports")).toBeInTheDocument()
  expect(screen.queryByText(/Ignored:/)).toBeNull()
})

it("can be closed while committing and its close button sits inside the sheet", async () => {
  vi.useFakeTimers()
  mockValidation(uploadOk.report)
  renderWithProviders(<Host />, { viewport: 390 })

  pick(EXPORT_FILES)
  await flush(4000)
  mockApi({
    "POST /api/v1/snapshot_uploads/:id/commit": () => HttpResponse.json(committing(10), { status: 202 }),
    [`GET /api/v1/snapshot_uploads/${ID}`]: () => HttpResponse.json(committing(50)),
  })
  fireEvent.click(screen.getByRole("button", { name: "Replace snapshot" }))
  await flush(0)

  // The mobile sheet must not push its close button off the panel.
  const close = screen.getByRole("button", { name: "Close" })
  expect(close).toHaveClass("top-0")
  expect(close).not.toHaveClass("-top-2")

  fireEvent.click(close)
  expect(screen.queryByRole("dialog")).toBeNull()
})

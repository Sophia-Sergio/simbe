import { fireEvent, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HttpResponse, http } from "msw"
import { EXPORT_FILES } from "@/components/shared/FileChecklist"
import type { Report } from "@/api/types"
import { server } from "@/mocks/server"
import { renderWithProviders } from "@/test/renderWithProviders"
import { LoadDataStep } from "./LoadDataStep"

function csvFiles(names: readonly string[]): File[] {
  return names.map((name) => new File(["a,b\n1,2\n"], name, { type: "text/csv" }))
}

const errorReport: Report = {
  ok: false,
  errors: [{ code: "bad_headers", file: "stage_history.csv", row: 12, message: "Unexpected column `stage`" }],
  warnings: [],
  ignored: [],
  diff: { leads: { current: 0, incoming: 10, delta: 10 } },
  checks: { files_matched: "6 of 7", duplicates: 0, screener_encrypted: true },
}

const okReport: Report = {
  ok: true,
  errors: [],
  warnings: [],
  ignored: [],
  diff: { leads: { current: 0, incoming: 10, delta: 10 } },
  checks: { files_matched: "7 of 7", duplicates: 0, screener_encrypted: true },
}

/** A validated upload the step can render as soon as it polls. */
function stubValidated(report: Report): void {
  server.use(
    http.post("/api/v1/snapshot_uploads", () =>
      HttpResponse.json(
        { id: "u-test", status: "validating", progress: { phase: "storing", pct: 0 }, report: null, snapshot: null, error: null },
        { status: 201 },
      ),
    ),
    http.get("/api/v1/snapshot_uploads/:id", () =>
      HttpResponse.json({ id: "u-test", status: "validated", progress: null, report, snapshot: null, error: null }),
    ),
  )
}

/**
 * The full async journey: validate → review → commit → import (with a running row count) → loaded.
 * jsdom's FormData is not a `BodyInit` for Node's fetch, so the file names cannot reach the default
 * handler from a component test; the dropzone → hook hand-off is asserted through `FileChecklist`.
 */
function stubLoadJourney(report: Report): void {
  let importing = 0
  let committed = false
  server.use(
    http.post("/api/v1/snapshot_uploads", () =>
      HttpResponse.json(
        { id: "u-test", status: "validating", progress: { phase: "storing", pct: 0 }, report: null, snapshot: null, error: null },
        { status: 201 },
      ),
    ),
    http.get("/api/v1/snapshot_uploads/:id", () => {
      if (!committed) return HttpResponse.json({ id: "u-test", status: "validated", progress: null, report, snapshot: null, error: null })
      importing += 1
      if (importing < 4) {
        return HttpResponse.json({
          id: "u-test",
          status: "committing",
          progress: { phase: "importing", pct: 40, rows_done: 24000, rows_total: 52000 },
          report,
          snapshot: null,
          error: null,
        })
      }
      return HttpResponse.json({ id: "u-test", status: "committed", progress: null, report, snapshot: null, error: null })
    }),
    http.post("/api/v1/snapshot_uploads/:id/commit", () => {
      committed = true
      return HttpResponse.json(
        { id: "u-test", status: "committing", progress: { phase: "importing", pct: 10, rows_done: 5200, rows_total: 52000 }, report, snapshot: null, error: null },
        { status: 202 },
      )
    }),
  )
}

it("walks dropzone → validating → review → import and reports the load as done", async () => {
  stubLoadJourney(okReport)
  renderWithProviders(<LoadDataStep agencyName="Harbor Surrogacy" onSkip={vi.fn()} />)

  await userEvent.upload(screen.getByLabelText(/csv files/i), csvFiles(EXPORT_FILES))
  await waitFor(() => expect(screen.getAllByText("Loaded")).toHaveLength(7))

  expect(await screen.findByText("Review changes", {}, { timeout: 4000 })).toBeInTheDocument()
  expect(screen.getByText("Leads 0 → 10 (+10)")).toBeInTheDocument()
  expect(screen.getByText("Files matched to Harbor Surrogacy 7 of 7")).toBeInTheDocument()
  expect(screen.getByText("Screener answers are encrypted")).toBeInTheDocument()

  await userEvent.click(screen.getByRole("button", { name: "Load data" }))
  expect(await screen.findByText("Importing rows (24,000 of 52,000)", {}, { timeout: 4000 })).toBeInTheDocument()
  expect(await screen.findByText("Your data is loaded", {}, { timeout: 10000 })).toBeInTheDocument()
}, 30000)

it("disables Load data and lists errors when the report has errors", async () => {
  stubValidated(errorReport)
  renderWithProviders(<LoadDataStep agencyName="Harbor Surrogacy" onSkip={vi.fn()} />)

  await userEvent.upload(screen.getByLabelText(/csv files/i), csvFiles(EXPORT_FILES.slice(0, 6)))

  expect(await screen.findByText("Review changes")).toBeInTheDocument()
  expect(screen.getByText(/stage_history\.csv row 12/)).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Load data" })).toBeDisabled()
})

it("reports an already-running load instead of failing silently", async () => {
  stubValidated(okReport)
  server.use(
    http.post("/api/v1/snapshot_uploads/:id/commit", () =>
      HttpResponse.json({ error: { code: "already_in_progress", message: "A load is already running" } }, { status: 409 }),
    ),
  )
  renderWithProviders(<LoadDataStep agencyName="Harbor Surrogacy" onSkip={vi.fn()} />)

  await userEvent.upload(screen.getByLabelText(/csv files/i), csvFiles(EXPORT_FILES))
  const load = await screen.findByRole("button", { name: "Load data" })
  await userEvent.click(load)

  expect(await screen.findByText("A load is already running")).toBeInTheDocument()
})

it("commits once when Load data is double-clicked", async () => {
  stubValidated(okReport)
  let commits = 0
  server.use(
    http.post("/api/v1/snapshot_uploads/:id/commit", () => {
      commits += 1
      return HttpResponse.json(
        { id: "u-test", status: "committing", progress: { phase: "importing", pct: 10 }, report: okReport, snapshot: null, error: null },
        { status: 202 },
      )
    }),
  )
  renderWithProviders(<LoadDataStep agencyName="Harbor Surrogacy" onSkip={vi.fn()} />)

  await userEvent.upload(screen.getByLabelText(/csv files/i), csvFiles(EXPORT_FILES))
  const load = await screen.findByRole("button", { name: "Load data" })
  fireEvent.click(load)
  fireEvent.click(load)

  await waitFor(() => expect(commits).toBe(1))
})

it("lists uploaded files with a Loaded pill before the load finishes", async () => {
  renderWithProviders(<LoadDataStep agencyName="Harbor Surrogacy" onSkip={vi.fn()} />)

  expect(screen.getAllByText("Waiting")).toHaveLength(7)
  await userEvent.upload(screen.getByLabelText(/csv files/i), csvFiles(EXPORT_FILES))
  await waitFor(() => expect(screen.getAllByText("Loaded")).toHaveLength(7))
})

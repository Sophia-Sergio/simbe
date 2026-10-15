import { act } from "@testing-library/react"
import uploadCommitted from "@contracts/examples/snapshots/upload-committed.json"
import uploadOk from "@contracts/examples/snapshots/upload-ok.json"
import { mockApi } from "@/test/mockApi"
import { useSnapshotUpload } from "./snapshots"
import { renderHookWithQuery } from "./testUtils"

const ID = "66666666-6666-4666-8666-666666666666"
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
const file = (name = "leads.csv") => new File(["x"], name, { type: "text/csv" })

const created = { id: ID, status: "validating", progress: { phase: "storing", pct: 0 }, report: null, snapshot: null, error: null }
const validated = { id: ID, status: "validated", progress: null, report: uploadOk.report, snapshot: null, error: null }
const committing = (pct: number) => ({ id: ID, status: "committing", progress: { phase: "importing", pct, rows_done: 100, rows_total: 1000 }, report: uploadOk.report, snapshot: null, error: null })
const committed = { id: ID, status: "committed", progress: null, report: uploadOk.report, snapshot: uploadCommitted.snapshot, error: null }

afterEach(() => vi.useRealTimers())

async function flush(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

async function until(predicate: () => boolean, max = 12) {
  for (let i = 0; i < max && !predicate(); i += 1) await flush(600)
}

it("walks idle → uploading → validating → review → committing → done", async () => {
  vi.useFakeTimers()
  mockApi({ "POST /api/v1/snapshot_uploads": created })
  let polls = 0
  mockApi({
    [`GET /api/v1/snapshot_uploads/${ID}`]: () => {
      polls += 1
      return json(polls >= 4 ? validated : { ...created, progress: { phase: "parsing", pct: polls * 20 } })
    },
  })
  const { result } = renderHookWithQuery(() => useSnapshotUpload())
  expect(result.current.state).toBe("idle")

  await act(async () => {
    await result.current.upload([file()])
  })
  expect(result.current.state).toBe("validating")
  expect(result.current.files).toEqual(["leads.csv"])

  await until(() => result.current.state === "review")
  expect(result.current.state).toBe("review")
  expect(result.current.report?.ok).toBe(true)

  let commitPolls = 0
  mockApi({ [`POST /api/v1/snapshot_uploads/${ID}/commit`]: () => json(committing(10), 202) })
  mockApi({
    [`GET /api/v1/snapshot_uploads/${ID}`]: () => {
      commitPolls += 1
      return json(commitPolls === 1 ? committing(25) : committed)
    },
  })
  await act(async () => {
    await result.current.commit()
  })
  expect(result.current.state).toBe("committing")
  await until(() => result.current.state === "done")
  expect(result.current.state).toBe("done")
})

it("stops polling once the upload is committed", async () => {
  vi.useFakeTimers()
  let polls = 0
  mockApi({
    "GET /api/v1/snapshots/current": { snapshot: null, files: [], pending: { upload_id: ID, status: "committing", progress: { phase: "importing", pct: 10 } } },
    [`GET /api/v1/snapshot_uploads/${ID}`]: () => {
      polls += 1
      return json(polls === 1 ? committing(50) : committed)
    },
  })
  const { result } = renderHookWithQuery(() => useSnapshotUpload())
  await until(() => result.current.state === "done")
  expect(result.current.state).toBe("done")
  const settled = polls
  await flush(2000)
  expect(polls).toBe(settled)
})

it("resumes an in-flight upload found in /snapshots/current and surfaces a 409", async () => {
  vi.useFakeTimers()
  mockApi({
    "GET /api/v1/snapshots/current": { snapshot: null, files: [], pending: { upload_id: ID, status: "validating", progress: { phase: "parsing", pct: 65 } } },
    [`GET /api/v1/snapshot_uploads/${ID}`]: validated,
    "POST /api/v1/snapshot_uploads/:id/commit": () => json({ error: { code: "already_in_progress", message: "A load is already running" } }, 409),
  })
  const { result } = renderHookWithQuery(() => useSnapshotUpload())
  await until(() => result.current.state === "review")
  expect(result.current.state).toBe("review")

  await act(async () => {
    await result.current.commit()
  })
  expect(result.current.state).toBe("error")
  expect(result.current.error?.code).toBe("already_in_progress")
})

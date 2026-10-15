import type { SnapshotCurrent, SnapshotUpload } from "@/api/types"

const SEVEN = ["leads.csv", "stage_history.csv", "contact_log.csv", "screener_answers.csv", "web_sessions.csv", "appointments.csv", "applications.csv"]
const SIX = SEVEN.filter((name) => name !== "appointments.csv")

// jsdom's FormData is not a BodyInit for Node's fetch, so build the multipart body explicitly
// (this is exactly what the browser sends for `uploadFiles`).
function multipart(names: string[]): { body: string; contentType: string } {
  const boundary = "----simbe-test-boundary"
  let body = ""
  for (const name of names) {
    body += `--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${name}"\r\nContent-Type: text/csv\r\n\r\nid,source\r\n1,fb\r\n\r\n`
  }
  body += `--${boundary}--\r\n`
  return { body, contentType: `multipart/form-data; boundary=${boundary}` }
}

async function upload(names: string[]): Promise<string> {
  const { body, contentType } = multipart(names)
  const res = await fetch("/api/v1/snapshot_uploads", { method: "POST", headers: { "Content-Type": contentType, "X-Requested-With": "simbe" }, body })
  expect(res.status).toBe(201)
  return ((await res.json()) as SnapshotUpload).id
}

async function get(id: string): Promise<SnapshotUpload> {
  return (await (await fetch(`/api/v1/snapshot_uploads/${id}`)).json()) as SnapshotUpload
}

async function poll(id: string, until: SnapshotUpload["status"], max = 12): Promise<SnapshotUpload> {
  let last = await get(id)
  for (let i = 0; i < max && last.status !== until; i += 1) last = await get(id)
  return last
}

const commit = (id: string) => fetch(`/api/v1/snapshot_uploads/${id}/commit`, { method: "POST", headers: { "X-Requested-With": "simbe" } })

it("a 6-file upload validates with ok:false and a missing_file error for the absent file", async () => {
  const id = await upload(SIX)
  const body = await poll(id, "validated")
  expect(body.status).toBe("validated")
  expect(body.report?.ok).toBe(false)
  expect(body.report?.errors).toHaveLength(1)
  expect(body.report?.errors.some((error) => error.code === "missing_file" && error.file === "appointments.csv")).toBe(true)
})

it("commit before validation finishes is 409 not_validated", async () => {
  const id = await upload(SEVEN)
  const res = await commit(id)
  expect(res.status).toBe(409)
  expect((await res.json()).error.code).toBe("not_validated")
})

it("commit with an invalid report is 422 invalid_snapshot with the report", async () => {
  const id = await upload(SIX)
  await poll(id, "validated")
  const res = await commit(id)
  expect(res.status).toBe(422)
  const body = await res.json()
  expect(body.error.code).toBe("invalid_snapshot")
  expect(body.report.ok).toBe(false)
})

it("committing a valid upload advances committing → committed and updates /snapshots/current", async () => {
  const id = await upload(SEVEN)
  await poll(id, "validated")
  const res = await commit(id)
  expect(res.status).toBe(202)

  const during = (await (await fetch("/api/v1/snapshots/current")).json()) as SnapshotCurrent
  expect(during.pending?.status).toBe("committing")

  const pcts: number[] = []
  let last = await get(id)
  for (let i = 0; i < 12 && last.status !== "committed"; i += 1) {
    if (last.status === "committing" && last.progress) pcts.push(last.progress.pct)
    last = await get(id)
  }
  expect(last.status).toBe("committed")
  expect(pcts.length).toBeGreaterThan(0)
  expect([...pcts].sort((a, b) => a - b)).toEqual(pcts) // strictly rising progress
  expect(last.snapshot?.as_of).toBe("2026-10-08T09:00:00.000Z")

  const after = (await (await fetch("/api/v1/snapshots/current")).json()) as SnapshotCurrent
  expect(after.pending).toBeNull()
  expect(after.snapshot?.as_of).toBe("2026-10-08T09:00:00.000Z")
})

it("deleting an upload cancels it so a racing poll still sees it", async () => {
  const id = await upload(SEVEN)
  const res = await fetch(`/api/v1/snapshot_uploads/${id}`, { method: "DELETE", headers: { "X-Requested-With": "simbe" } })
  expect(res.status).toBe(204)
  const body = await get(id)
  expect(body.status).toBe("cancelled")
})

it("commit and cancel require the CSRF header", async () => {
  const id = await upload(SEVEN)
  expect((await fetch(`/api/v1/snapshot_uploads/${id}/commit`, { method: "POST" })).status).toBe(403)
  expect((await fetch(`/api/v1/snapshot_uploads/${id}`, { method: "DELETE" })).status).toBe(403)
})

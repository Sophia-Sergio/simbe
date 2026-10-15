// Conformance: every operation in the bundled contract must have a mock handler, and each default 2xx
// response must validate against the operation's JSON schema. This is what stops a fixture drifting
// from the contract. The bundle is produced HERE, at test time (`npm run contract`): contracts/dist/ is
// git-ignored, so CI and `make web-test` must not depend on a pre-existing (or freshly stale) bundle.
import { execSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import Ajv2020 from "ajv/dist/2020"
import addFormats from "ajv-formats"
import { parse } from "yaml"
import uploadOk from "@contracts/examples/snapshots/upload-ok.json"
import { db, OWNER_EMAIL } from "@/mocks/db"
import type { MockUpload } from "@/mocks/db"
import type { AgentMessage, Report } from "@/api/types"

const LEAD_ID = "aaaaaaaa-0000-4000-8000-000000000004"
const UPLOAD_ID = "66666666-6666-4666-8666-666666666666"
const CONVO_ID = "99999999-9999-4999-8999-999999999999"
const NOW = "2026-10-01T12:00:00.000Z"
const SEVEN = ["leads.csv", "stage_history.csv", "contact_log.csv", "screener_answers.csv", "web_sessions.csv", "appointments.csv", "applications.csv"]

type Operation = {
  operationId?: string
  responses: Record<string, { content?: Record<string, { schema?: Record<string, unknown> }> }>
}
type PathItem = Record<string, Operation | undefined>

const SPEC_ID = "https://simbe.test/openapi.bundled.yaml"
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..")
const BUNDLE_PATH = resolve(REPO_ROOT, "contracts/dist/openapi.bundled.yaml")

// Bundle (and lint) the contract now; a broken contract fails the whole suite loudly.
execSync("npm run contract", { cwd: REPO_ROOT, stdio: "pipe" })

const spec = parse(readFileSync(BUNDLE_PATH, "utf8")) as {
  paths: Record<string, PathItem>
  components: { schemas: Record<string, unknown> }
}

const ops = Object.entries(spec.paths).flatMap(([path, item]) =>
  ["get", "post", "patch", "delete"]
    .filter((method) => item[method])
    .map((method) => ({ path, method, op: item[method] as Operation })),
)

function first2xx(op: Operation): string | undefined {
  return ["200", "201", "202", "203", "204"].find((status) => op.responses[status])
}

function jsonSchema(op: Operation): Record<string, unknown> | undefined {
  const status = first2xx(op)
  return status ? op.responses[status].content?.["application/json"]?.schema : undefined
}

function samplePath(path: string): string {
  switch (path) {
    case "/leads/{id}":
      return `/leads/${LEAD_ID}`
    case "/snapshot_uploads/{id}":
      return `/snapshot_uploads/${UPLOAD_ID}`
    case "/snapshot_uploads/{id}/commit":
      return `/snapshot_uploads/${UPLOAD_ID}/commit`
    case "/agent/conversations/{id}":
      return `/agent/conversations/${CONVO_ID}`
    case "/invitations/{id}":
      return "/invitations/44444444-4444-4444-8444-444444444444"
    case "/invitations/{token}/preview":
      return "/invitations/abc/preview"
    case "/invitations/{token}/accept":
      return "/invitations/abc/accept"
    case "/coordinators/{name}":
      return "/coordinators/Dana%20Ortiz"
    case "/metrics/channels/{channel}":
      return "/metrics/channels/Facebook"
    case "/next_actions/{lead_id}/{queue}/completion":
      return `/next_actions/${LEAD_ID}/nudge_applications/completion`
    case "/ad_connections/{platform}":
      return "/ad_connections/meta"
    default:
      return path
  }
}

function multipart(names: string[]): { body: string; contentType: string } {
  const boundary = "----simbe-conformance-boundary"
  let body = ""
  for (const name of names) {
    body += `--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${name}"\r\nContent-Type: text/csv\r\n\r\nid,source\r\n1,fb\r\n\r\n`
  }
  body += `--${boundary}--\r\n`
  return { body, contentType: `multipart/form-data; boundary=${boundary}` }
}

function sampleBody(path: string, method: string): { body?: BodyInit; contentType?: string } {
  if (method === "get" || method === "delete") return {}
  const asJson = (value: unknown) => ({ body: JSON.stringify(value), contentType: "application/json" })
  switch (path) {
    case "/session":
      return asJson({ email: "erin@harbor.test", password: "x" })
    case "/signup":
      return asJson({
        user: { name: "New Owner", email: "new@harbor.test", password: "longpassword1" },
        agency: { name: "New Agency", timezone: "America/Los_Angeles", qualified_milestone: "records" },
      })
    case "/agency":
      return asJson({ qualified_milestone: "records" })
    case "/invitations":
      return asJson({ email: "maya@harbor.test", coordinator_name: "Jess Kim" })
    case "/invitations/{token}/accept":
      return asJson({ name: "New Coordinator", password: "longpassword1" })
    case "/ad_connections":
      return asJson({ platform: "meta" })
    case "/agent/messages":
      return asJson({ text: "Which channel costs the most?" })
    case "/snapshot_uploads":
      return multipart(SEVEN)
    default:
      return {}
  }
}

async function call(path: string, method: string): Promise<Response> {
  const { body, contentType } = sampleBody(path, method)
  const headers: Record<string, string> = { "X-Requested-With": "simbe" }
  if (contentType) headers["Content-Type"] = contentType
  return fetch(`/api/v1${samplePath(path)}`, { method: method.toUpperCase(), headers, body })
}

/** Seeds the state some GET handlers need (an upload and a conversation). */
function seed() {
  db.uploads.set(UPLOAD_ID, {
    files: SEVEN,
    report: uploadOk.report as Report,
    status: "validated",
    progress: null,
    polls: 0,
    commitPolls: 0,
    commits: 0,
    snapshot: null,
  } satisfies MockUpload)
  const message: AgentMessage = { id: "99999999-9999-4999-8999-999999999997", role: "user", created_at: NOW, body: { text: "Which channel costs the most?" } }
  db.conversations.set(CONVO_ID, { owner: OWNER_EMAIL, messages: [message] })
}

const ajv = new Ajv2020({ strict: false, allErrors: true })
addFormats(ajv)
// Register the whole document so the response schemas' `#/components/...` refs resolve.
ajv.addSchema({ $id: SPEC_ID, ...spec })

const escapePointer = (segment: string) => segment.replace(/~/g, "~0").replace(/\//g, "~1")

it("has a mock handler for every operation (coverage)", async () => {
  seed()
  expect(ops).toHaveLength(39)
  for (const { path, method } of ops) {
    // With onUnhandledRequest: "error", an operation without a handler rejects here.
    const res = await call(path, method)
    expect(res.status).toBeLessThan(500)
  }
})

const validatable = ops.filter(({ op }) => jsonSchema(op))

it.each(validatable)("$method $path default response matches its schema", async ({ path, method, op }) => {
  seed()
  const status = first2xx(op) as string
  const res = await call(path, method)
  expect(res.ok).toBe(true)
  const body = await res.json()
  const pointer = `#/paths/${escapePointer(path)}/${method}/responses/${status}/content/${escapePointer("application/json")}/schema`
  const validate = ajv.compile({ $ref: `${SPEC_ID}${pointer}` })
  const valid = validate(body)
  if (!valid) throw new Error(`${method} ${path}: ${ajv.errorsText(validate.errors)}`)
  expect(valid).toBe(true)
})

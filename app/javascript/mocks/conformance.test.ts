// Conformance: every operation in the bundled contract has a mock handler, returns a status the contract
// lists, and validates against the operation's JSON schema. The bundle is produced HERE, at test time
// (`npm run contract`): contracts/dist/ is git-ignored, so CI and `make web-test` must not depend on a
// pre-existing (or freshly stale) bundle.
import { execSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import Ajv2020 from "ajv/dist/2020"
import addFormats from "ajv-formats"
import { parse } from "yaml"
import uploadOk from "@contracts/examples/snapshots/upload-ok.json"
import { db, COORDINATOR_EMAIL, OWNER_EMAIL } from "@/mocks/db"
import type { MockUpload } from "@/mocks/db"
import type { AgentMessage, Report } from "@/api/types"

const SPEC_ID = "https://simbe.test/openapi.bundled.yaml"
const TIGHT_ID = "https://simbe.test/openapi.tight.yaml"
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..")
const BUNDLE_PATH = resolve(REPO_ROOT, "contracts/dist/openapi.bundled.yaml")

// Bundle (and lint) the contract now; a broken contract fails the whole suite loudly.
execSync("npm run contract", { cwd: REPO_ROOT, stdio: "pipe" })

const LEAD_ID = "aaaaaaaa-0000-4000-8000-000000000004"
const UPLOAD_ID = "66666666-6666-4666-8666-666666666666"
const CONVO_ID = "99999999-9999-4999-8999-999999999999"
const UNKNOWN_UUID = "00000000-0000-4000-8000-000000000000"
const NOW = "2026-10-01T12:00:00.000Z"
const SEVEN = ["leads.csv", "stage_history.csv", "contact_log.csv", "screener_answers.csv", "web_sessions.csv", "appointments.csv", "applications.csv"]
const METHODS = ["get", "post", "patch", "delete"]

type Operation = {
  operationId?: string
  security?: unknown[]
  responses: Record<string, { content?: Record<string, { schema?: Record<string, unknown> }> }>
}
type PathItem = Record<string, Operation | undefined>
type Spec = { paths: Record<string, PathItem>; security?: unknown[]; components: { schemas: Record<string, unknown> } }

const spec = parse(readFileSync(BUNDLE_PATH, "utf8")) as Spec
const ops = Object.entries(spec.paths).flatMap(([path, item]) =>
  METHODS.filter((method) => item[method]).map((method) => ({ path, method, op: item[method] as Operation })),
)

/** Adds `additionalProperties: false` (or `unevaluatedProperties: false` for allOf) so extra fields fail. */
function tighten(node: unknown, isAllOfMember = false): unknown {
  if (Array.isArray(node)) return node.map((item) => tighten(item, false))
  if (!node || typeof node !== "object") return node
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    out[key] = key === "allOf" && Array.isArray(value) ? value.map((member) => tighten(member, true)) : tighten(value, false)
  }
  if (!isAllOfMember && out.properties && out.additionalProperties === undefined) out.additionalProperties = false
  if (!isAllOfMember && out.allOf && out.unevaluatedProperties === undefined && out.additionalProperties === undefined) out.unevaluatedProperties = false
  return out
}

/** Component schemas referenced from inside an `allOf` must not get `additionalProperties: false`
 * (their siblings in the composition contribute properties). */
function allOfReferencedSchemas(spec: Spec): Set<string> {
  const names = new Set<string>()
  const walk = (node: unknown, inAllOf: boolean) => {
    if (Array.isArray(node)) {
      node.forEach((item) => walk(item, inAllOf))
      return
    }
    if (!node || typeof node !== "object") return
    const obj = node as Record<string, unknown>
    if (inAllOf && typeof obj.$ref === "string") names.add(obj.$ref.split("/").pop() as string)
    for (const [key, value] of Object.entries(obj)) {
      if (key === "allOf" && Array.isArray(value)) value.forEach((member) => walk(member, true))
      else walk(value, false)
    }
  }
  walk(spec, false)
  return names
}

const ajv = new Ajv2020({ strict: false, allErrors: true, unevaluated: true })
addFormats(ajv)
ajv.addSchema({ $id: SPEC_ID, ...spec })
const tightSpec = tighten(spec) as Spec
for (const name of allOfReferencedSchemas(spec)) {
  const referenced = tightSpec.components.schemas[name] as Record<string, unknown> | undefined
  if (referenced) delete referenced.additionalProperties
}
ajv.addSchema({ ...tightSpec, $id: TIGHT_ID })
const errorValidate = ajv.compile({ $ref: `${SPEC_ID}#/components/schemas/Error` })

const STATUSES = ["200", "201", "202", "203", "204"]
const listed = (op: Operation) => Object.keys(op.responses)
const listed2xx = (op: Operation) => STATUSES.filter((status) => op.responses[status])
const jsonStatus = (op: Operation) => listed2xx(op).find((status) => op.responses[status].content?.["application/json"]?.schema)
const escapePointer = (segment: string) => segment.replace(/~/g, "~0").replace(/\//g, "~1")

function compile(specId: string, path: string, method: string, status: string) {
  const pointer = `#/paths/${escapePointer(path)}/${method}/responses/${status}/content/${escapePointer("application/json")}/schema`
  return ajv.compile({ $ref: `${specId}${pointer}` })
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

/** A path with unknown params, for the operations the contract says can 404; null when there is none. */
function unknownPath(path: string): string | null {
  switch (path) {
    case "/leads/{id}":
      return `/leads/${UNKNOWN_UUID}`
    case "/snapshot_uploads/{id}":
      return `/snapshot_uploads/${UNKNOWN_UUID}`
    case "/snapshot_uploads/{id}/commit":
      return `/snapshot_uploads/${UNKNOWN_UUID}/commit`
    case "/agent/conversations/{id}":
      return `/agent/conversations/${UNKNOWN_UUID}`
    case "/invitations/{id}":
      return `/invitations/${UNKNOWN_UUID}`
    case "/coordinators/{name}":
      return "/coordinators/Nobody"
    case "/metrics/channels/{channel}":
      return "/metrics/channels/Nope"
    case "/next_actions/{lead_id}/{queue}/completion":
      return `/next_actions/${UNKNOWN_UUID}/text_back_now/completion`
    default:
      return null
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
      return asJson({ email: OWNER_EMAIL, password: "x" })
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

async function call(path: string, method: string, unknown = false): Promise<Response> {
  const target = unknown ? unknownPath(path) : samplePath(path)
  if (target === null) throw new Error(`no unknown-param path for ${path}`)
  const { body, contentType } = sampleBody(path, method)
  const headers: Record<string, string> = { "X-Requested-With": "simbe" }
  if (contentType) headers["Content-Type"] = contentType
  return fetch(`/api/v1${target}`, { method: method.toUpperCase(), headers, body })
}

function asOwner() {
  db.reset()
  db.session = { email: OWNER_EMAIL, role: "owner" }
  seed()
}

function asCoordinator() {
  db.reset()
  db.session = { email: COORDINATOR_EMAIL, role: "coordinator" }
  seed()
}

/** Seeds the state some GET handlers need (an upload and a conversation owned by the owner). */
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

function expectErrorSchema(body: unknown) {
  const valid = errorValidate(body)
  if (!valid) throw new Error(`error envelope: ${ajv.errorsText(errorValidate.errors)}`)
  expect(valid).toBe(true)
}

const isPublic = (op: Operation) => Array.isArray(op.security) && op.security.length === 0
const publicOps = ops.filter(({ op }) => isPublic(op))
const protectedOps = ops.filter(({ op }) => !isPublic(op))
const forbiddenOps = ops.filter(({ op }) => op.responses["403"] && !isPublic(op))
const notFoundOps = ops.filter(({ path, op }) => op.responses["404"] && unknownPath(path) !== null)
const validatable = ops.filter(({ op }) => jsonStatus(op))

it("has a mock handler for every operation, returning a status the contract lists", async () => {
  expect(ops).toHaveLength(39)
  for (const { path, method, op } of ops) {
    asOwner()
    const res = await call(path, method)
    if (!listed(op).includes(String(res.status))) throw new Error(`${method.toUpperCase()} ${path}: unexpected ${res.status}`)
  }
})

it.each(validatable)("$method $path default response matches its (tightened) schema", async ({ path, method, op }) => {
  asOwner()
  const status = jsonStatus(op) as string
  const res = await call(path, method)
  expect(listed2xx(op)).toContain(String(res.status)) // accept any listed 2xx (connect-platform has 200 and 201)
  const body = await res.json()
  const validate = compile(TIGHT_ID, path, method, status)
  const valid = validate(body)
  if (!valid) throw new Error(`${method} ${path}: ${ajv.errorsText(validate.errors)}`)
  expect(valid).toBe(true)
})

it.each(publicOps)("$method $path is public and returns a listed status", async ({ path, method, op }) => {
  db.reset()
  db.session = null
  seed()
  const res = await call(path, method)
  if (!listed(op).includes(String(res.status))) throw new Error(`${method} ${path}: unexpected ${res.status}`)
})

it.each(protectedOps)("$method $path requires a session (401 + error envelope)", async ({ path, method }) => {
  db.reset()
  db.session = null
  seed()
  const res = await call(path, method)
  expect(res.status).toBe(401)
  expectErrorSchema(await res.json())
})

it.each(forbiddenOps)("$method $path is 403 for a coordinator", async ({ path, method }) => {
  asCoordinator()
  const res = await call(path, method)
  expect(res.status).toBe(403)
  expectErrorSchema(await res.json())
})

it.each(notFoundOps)("$method $path returns 404 for an unknown id", async ({ path, method }) => {
  asOwner()
  const res = await call(path, method, true)
  expect(res.status).toBe(404)
  expectErrorSchema(await res.json())
})

it("owner lead detail hides raw screener answers and masks the phone", async () => {
  asOwner()
  const res = await call("/leads/{id}", "get")
  const body = (await res.json()) as { contact: { phone: string } }
  expect(JSON.stringify(body)).not.toContain('"answer"')
  expect(body.contact.phone).toMatch(/^•••/)
})

it("the assigned coordinator sees raw answers and the real phone", async () => {
  asCoordinator()
  const res = await call("/leads/{id}", "get")
  const body = (await res.json()) as { contact: { phone: string }; screener: { items: { answer?: string }[] } }
  expect(body.screener.items[0].answer).toBeDefined()
  expect(body.contact.phone).not.toMatch(/^•••/)
  const validate = compile(TIGHT_ID, "/leads/{id}", "get", "200")
  const valid = validate(body)
  if (!valid) throw new Error(`coordinator lead detail: ${ajv.errorsText(validate.errors)}`)
  expect(valid).toBe(true)
})

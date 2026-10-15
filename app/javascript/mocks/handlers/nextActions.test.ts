import type { NextActions } from "@/api/types"
import { asRole } from "@/test/mockApi"

const csrf = { "X-Requested-With": "simbe" }
const nextActions = async (): Promise<NextActions> => (await (await fetch("/api/v1/next_actions")).json()) as NextActions
const completionUrl = (leadId: string, queue: string) => `/api/v1/next_actions/${leadId}/${queue}/completion`

it("the owner sees four items across the four queues", async () => {
  const body = await nextActions()
  expect(body.queues).toHaveLength(4)
  expect(body.progress).toEqual({ done: 0, total: 4 })
})

it("completing is idempotent and recomputes the queue count and progress", async () => {
  const url = completionUrl("aaaaaaaa-0000-4000-8000-000000000007", "text_back_now")
  expect((await (await fetch(url, { method: "POST", headers: csrf })).json()).done).toBe(true)
  expect((await (await fetch(url, { method: "POST", headers: csrf })).json()).done).toBe(true)
  const body = await nextActions()
  expect(body.progress.done).toBe(1)
  expect(body.queues[0].count).toBe(0)
})

it("undo is idempotent", async () => {
  const url = completionUrl("aaaaaaaa-0000-4000-8000-000000000007", "text_back_now")
  await fetch(url, { method: "POST", headers: csrf })
  expect((await (await fetch(url, { method: "DELETE", headers: csrf })).json()).done).toBe(false)
  expect((await (await fetch(url, { method: "DELETE", headers: csrf })).json()).done).toBe(false)
  expect((await nextActions()).progress.done).toBe(0)
})

it("the coordinator only sees Dana's three items", async () => {
  asRole("coordinator")
  const body = await nextActions()
  expect(body.progress.total).toBe(3)
  expect(body.queues[0].items).toHaveLength(0)
})

it("a bad queue is 422 and an unknown combo is 404", async () => {
  expect((await fetch(completionUrl("aaaaaaaa-0000-4000-8000-000000000007", "nope"), { method: "POST", headers: csrf })).status).toBe(422)
  expect((await fetch(completionUrl("aaaaaaaa-0000-4000-8000-000000000001", "text_back_now"), { method: "POST", headers: csrf })).status).toBe(404)
})

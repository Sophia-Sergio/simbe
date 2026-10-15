import { asRole } from "@/test/mockApi"

const headers = { "Content-Type": "application/json", "X-Requested-With": "simbe" }
const ask = (text: string, extra: Record<string, unknown> = {}) =>
  fetch("/api/v1/agent/messages", { method: "POST", headers, body: JSON.stringify({ text, ...extra }) })

it("empty text is 422 empty_text", async () => {
  const res = await ask("   ")
  expect(res.status).toBe(422)
  expect((await res.json()).error.code).toBe("empty_text")
})

it("text over 500 characters is 422 text_too_long", async () => {
  const res = await ask("x".repeat(501))
  expect(res.status).toBe(422)
  expect((await res.json()).error.code).toBe("text_too_long")
})

it("answers and appends both messages to the conversation", async () => {
  const res = await ask("Which channel costs the most?")
  expect(res.status).toBe(201)
  const body = await res.json()
  expect(body.message.role).toBe("assistant")
  const conversation = await (await fetch(`/api/v1/agent/conversations/${body.conversation_id}`)).json()
  expect(conversation.messages).toHaveLength(2)
})

it("echoes the question when it mentions Google", async () => {
  const body = await (await ask("What about Google?")).json()
  expect(body.message.body.text).toContain('What about Google?')
})

it("a second message while one is in flight is 409 already_in_progress", async () => {
  const first = ask("Which channel costs the most?")
  await new Promise((resolve) => setTimeout(resolve, 5))
  const second = await ask("Where do most applicants drop off?")
  expect(second.status).toBe(409)
  expect((await second.json()).error.code).toBe("already_in_progress")
  expect((await first).status).toBe(201)
})

it("a conversation belongs to the user who started it", async () => {
  const body = await (await ask("Which channel costs the most?")).json()
  asRole("coordinator")
  expect((await fetch(`/api/v1/agent/conversations/${body.conversation_id}`)).status).toBe(404)
})

it("suggestions are four for owners and three for coordinators", async () => {
  expect((await (await fetch("/api/v1/agent/suggestions")).json()).suggestions).toHaveLength(4)
  asRole("coordinator")
  expect((await (await fetch("/api/v1/agent/suggestions")).json()).suggestions).toHaveLength(3)
})

it("usage is owner-only", async () => {
  expect((await fetch("/api/v1/agent/usage")).status).toBe(200)
  asRole("coordinator")
  expect((await fetch("/api/v1/agent/usage")).status).toBe(403)
})

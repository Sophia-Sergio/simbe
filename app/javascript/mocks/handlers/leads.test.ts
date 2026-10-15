import type { Board, LeadDetail, LeadList } from "@/api/types"
import { asRole } from "@/test/mockApi"

const json = async <T,>(path: string): Promise<T> => (await (await fetch(path)).json()) as T

it("the owner board has the fixture counts", async () => {
  const board = await json<Board>("/api/v1/leads/board")
  expect(board.columns.action_needed.count).toBe(4)
  expect(board.columns.qualified.count).toBe(3)
})

it("the coordinator board only contains Dana's cards", async () => {
  asRole("coordinator")
  const board = await json<Board>("/api/v1/leads/board")
  expect(board.columns.action_needed.count).toBe(3)
  expect(board.columns.qualified.count).toBe(0)
  const cards = Object.values(board.columns).flatMap((column) => column.leads)
  expect(cards.every((card) => card.coordinator === "Dana Ortiz")).toBe(true)
})

it("q=% is treated as a literal and matches no lead", async () => {
  const body = await json<LeadList>("/api/v1/leads?q=%")
  expect(body.leads).toEqual([])
})

it("status=all includes paused and closed cards", async () => {
  const body = await json<LeadList>("/api/v1/leads?status=all")
  expect(body.leads.length).toBeGreaterThan(5)
})

it("a coordinator cannot open another coordinator's lead", async () => {
  asRole("coordinator")
  expect((await fetch("/api/v1/leads/aaaaaaaa-0000-4000-8000-000000000001")).status).toBe(404)
})

it("raw screener answers are only for the assigned coordinator", async () => {
  const owner = await json<LeadDetail>("/api/v1/leads/aaaaaaaa-0000-4000-8000-000000000004")
  expect(owner.contact.can_contact).toBe(false)
  expect(owner.screener.items.every((item) => item.answer === undefined)).toBe(true)

  asRole("coordinator")
  const coordinator = await json<LeadDetail>("/api/v1/leads/aaaaaaaa-0000-4000-8000-000000000004")
  expect(coordinator.contact.can_contact).toBe(true)
  expect(coordinator.screener.items[0].answer).toBeDefined()
})

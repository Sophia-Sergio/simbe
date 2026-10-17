import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { TaskItem } from "@/api/types"
import { TaskCard } from "./TaskCard"

const item: TaskItem = {
  lead_id: "aaaaaaaa-0000-4000-8000-000000000004",
  name: "L4 Alpha",
  age_minutes: 11630,
  age_label: "8d",
  reason: "Application 40% · quiet 8d",
  done: false,
}

it("shows name, age and reason, and opens the lead panel from the card body", async () => {
  const onOpen = vi.fn()
  render(<TaskCard item={item} queue="nudge_applications" onOpen={onOpen} onToggle={vi.fn()} />)

  expect(screen.getByText("L4 Alpha")).toBeInTheDocument()
  expect(screen.getByText("8d")).toBeInTheDocument()
  expect(screen.getByText("Application 40% · quiet 8d")).toBeInTheDocument()

  await userEvent.click(screen.getByText("L4 Alpha"))
  expect(onOpen).toHaveBeenCalledWith(item.lead_id)
})

it("labels the contact button Text, or Call for rebooks, and opens the panel on Summary", async () => {
  const onOpen = vi.fn()
  const { unmount } = render(<TaskCard item={item} queue="nudge_applications" onOpen={onOpen} onToggle={vi.fn()} />)
  await userEvent.click(screen.getByRole("button", { name: "Text" }))
  expect(onOpen).toHaveBeenCalledWith(item.lead_id, "summary")
  unmount()

  render(<TaskCard item={item} queue="rebook_consults" onOpen={onOpen} onToggle={vi.fn()} />)
  expect(screen.getByRole("button", { name: "Call" })).toBeInTheDocument()
})

it("a done card dims, reads Undo and toggles back", async () => {
  const onToggle = vi.fn()
  render(<TaskCard item={{ ...item, done: true }} queue="nudge_applications" onOpen={vi.fn()} onToggle={onToggle} />)

  expect(screen.getByTestId("task-card")).toHaveClass("opacity-50")
  const undo = screen.getByRole("button", { name: "Undo" })
  await userEvent.click(undo)
  expect(onToggle).toHaveBeenCalledWith(expect.objectContaining({ lead_id: item.lead_id }), false)
})

it("an open card reads Done and toggles on", async () => {
  const onToggle = vi.fn()
  render(<TaskCard item={item} queue="text_back_now" onOpen={vi.fn()} onToggle={onToggle} />)

  const done = screen.getByRole("button", { name: "Done" })
  await userEvent.click(done)
  expect(onToggle).toHaveBeenCalledWith(expect.objectContaining({ lead_id: item.lead_id }), true)
})

it("disables Done while the toggle is in flight", () => {
  render(<TaskCard item={item} queue="text_back_now" onOpen={vi.fn()} onToggle={vi.fn()} pending />)
  expect(screen.getByRole("button", { name: "Done" })).toBeDisabled()
})

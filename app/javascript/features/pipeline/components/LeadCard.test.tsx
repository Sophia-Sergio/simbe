import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import listFixture from "@contracts/examples/leads/list.json"
import type { LeadCard as LeadCardData } from "@/api/types"
import { LeadCard } from "./LeadCard"

const L4 = (listFixture.leads as unknown as LeadCardData[]).find((lead) => lead.name === "L4 Alpha") as LeadCardData

it("shows the name, source and status pills, the meta line and the stage bar", () => {
  render(<LeadCard lead={L4} timezone="America/Los_Angeles" onOpen={() => {}} />)
  expect(screen.getByText("L4 Alpha")).toBeInTheDocument()
  expect(screen.getByText("Instagram")).toBeInTheDocument()
  expect(screen.getByText("Nudge")).toBeInTheDocument()
  expect(screen.getByText("28 yrs | ID")).toBeInTheDocument()
  expect(screen.getByRole("img", { name: "L4 Alpha stage progress" })).toBeInTheDocument()
})

it("omits a missing age or state cleanly", () => {
  render(<LeadCard lead={{ ...L4, age: null, state: "CA" }} timezone="UTC" onOpen={() => {}} />)
  expect(screen.getByText("CA")).toBeInTheDocument()
  expect(screen.queryByText(/yrs/)).toBeNull()

  render(<LeadCard lead={{ ...L4, age: 34, state: null }} timezone="UTC" onOpen={() => {}} />)
  expect(screen.getByText("34 yrs")).toBeInTheDocument()
  expect(screen.queryByText("|")).toBeNull()
})

it("renders the date in the agency time zone", () => {
  const lead = { ...L4, date: "2026-09-30T02:00:00.000Z" }
  const { unmount } = render(<LeadCard lead={lead} timezone="America/Los_Angeles" onOpen={() => {}} />)
  expect(screen.getByText("Sep 29")).toBeInTheDocument()
  unmount()
  render(<LeadCard lead={lead} timezone="UTC" onOpen={() => {}} />)
  expect(screen.getByText("Sep 30")).toBeInTheDocument()
})

it("opens the lead panel with the card's id", async () => {
  const onOpen = vi.fn()
  render(<LeadCard lead={L4} timezone="UTC" onOpen={onOpen} />)
  await userEvent.click(screen.getByRole("button", { name: /L4 Alpha/ }))
  expect(onOpen).toHaveBeenCalledWith(L4.id)
})

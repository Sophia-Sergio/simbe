import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import detailRepeat from "@contracts/examples/leads/detail-repeat.json"
import type { LeadDetail } from "@/api/types"
import { useLeadPanel } from "@/app/leadPanel"
import { renderWithProviders } from "@/test/renderWithProviders"
import { InquiriesCard } from "./InquiriesCard"

const withInquiries = detailRepeat as unknown as LeadDetail
const FIRST = "aaaaaaaa-0000-4000-8000-000000000001"

function Probe() {
  const { leadId } = useLeadPanel()
  return <p data-testid="open-lead">{leadId ?? "none"}</p>
}

function renderCard(detail: LeadDetail) {
  return renderWithProviders(
    <>
      <InquiriesCard detail={detail} tz="America/Los_Angeles" />
      <Probe />
    </>,
  )
}

it("lists the person's other inquiries and opens the one that is clicked", async () => {
  const user = userEvent.setup()
  renderCard(withInquiries)

  expect(screen.getByRole("heading", { name: "This person's other inquiries" })).toBeInTheDocument()
  const row = screen.getByRole("button", { name: /Sep 20/ })
  expect(row).toHaveTextContent("Accepted")
  expect(row).toHaveTextContent("Facebook")
  expect(row).toHaveTextContent("Jess Kim")

  await user.click(row)
  expect(screen.getByTestId("open-lead")).toHaveTextContent(FIRST)
})

it("renders nothing when there are no other inquiries and no overlap", () => {
  const { container } = renderCard({ ...withInquiries, other_inquiries: [], open_overlap: false })

  expect(container.querySelector("section")).toBeNull()
})

it("says another inquiry was still open, even when the viewer can see none", () => {
  renderCard({ ...withInquiries, other_inquiries: [], open_overlap: true })

  expect(screen.getByText("Another inquiry from this person was still open")).toBeInTheDocument()
  expect(screen.queryByRole("button")).toBeNull()
})

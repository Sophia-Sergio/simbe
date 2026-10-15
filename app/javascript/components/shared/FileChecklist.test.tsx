import { render, screen } from "@testing-library/react"
import { FileChecklist } from "./FileChecklist"

it("marks the three present files Loaded and the rest Waiting", () => {
  render(<FileChecklist present={["leads.csv", "stage_history.csv", "screener_answers.csv"]} />)
  expect(screen.getAllByText("Loaded")).toHaveLength(3)
  expect(screen.getAllByText("Waiting")).toHaveLength(4)
})

it("is case-insensitive about the file names and shows row counts", () => {
  render(
    <FileChecklist expected={["leads.csv"]} present={["Leads.CSV"]} statuses={{ "leads.csv": 3530 }} />,
  )
  expect(screen.getByText("Loaded")).toBeInTheDocument()
  expect(screen.getByText("3,530")).toBeInTheDocument()
})

it("treats everything as Waiting when nothing is present", () => {
  render(<FileChecklist expected={["leads.csv"]} present={[]} />)
  expect(screen.getAllByText("Waiting")).toHaveLength(1)
})

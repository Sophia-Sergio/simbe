import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QualifiedRadioCards } from "./QualifiedRadioCards"

it("renders four radio cards and marks the recommended one", () => {
  render(<QualifiedRadioCards value="application_submitted" onChange={() => {}} />)
  expect(screen.getAllByRole("radio")).toHaveLength(4)
  expect(screen.getByText("Recommended")).toBeInTheDocument()
  expect(screen.getByText("Attended a consult")).toBeInTheDocument()
})

it("calls onChange with the chosen milestone", async () => {
  const onChange = vi.fn()
  render(<QualifiedRadioCards value="application_submitted" onChange={onChange} />)
  await userEvent.click(screen.getByRole("radio", { name: /Reached medical records/ }))
  expect(onChange).toHaveBeenCalledWith("records")
})

it("disables every radio when disabled", () => {
  render(<QualifiedRadioCards value="records" onChange={() => {}} disabled />)
  for (const radio of screen.getAllByRole("radio")) {
    expect(radio).toBeDisabled()
  }
})

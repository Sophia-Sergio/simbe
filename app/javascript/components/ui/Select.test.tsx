import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Field } from "./Field"
import { Select } from "./Select"

const options = [
  { value: "all", label: "All leads" },
  { value: "open", label: "Open only" },
  { value: "closed", label: "Closed" },
]

it("renders a native select and fires onChange with the string value", async () => {
  const onChange = vi.fn()
  render(
    <Field label="Status">
      <Select value="all" onChange={onChange} options={options} />
    </Field>,
  )
  const select = screen.getByLabelText("Status")
  expect(select.tagName).toBe("SELECT")
  await userEvent.selectOptions(select, "open")
  expect(onChange).toHaveBeenCalledWith("open")
})

it("can be labelled directly and marked invalid", () => {
  render(<Select aria-label="Status" value="all" options={options} invalid />)
  const select = screen.getByLabelText("Status")
  expect(select).toHaveAttribute("aria-invalid", "true")
})

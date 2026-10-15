import { render, screen } from "@testing-library/react"
import { Field } from "./Field"
import { Input } from "./Input"

it("resolves the label and announces the error", () => {
  render(
    <Field label="Work email" error="This field is required">
      <Input />
    </Field>,
  )
  const input = screen.getByLabelText("Work email")
  expect(input).toHaveAttribute("aria-invalid", "true")
  expect(screen.getByRole("alert")).toHaveTextContent("This field is required")
})

it("links the hint through aria-describedby", () => {
  render(
    <Field label="Work email" hint="We never share it">
      <Input />
    </Field>,
  )
  const input = screen.getByLabelText("Work email")
  expect(input).toHaveAccessibleDescription("We never share it")
  expect(input).not.toHaveAttribute("aria-invalid")
})

it("accepts an explicit htmlFor", () => {
  render(
    <Field label="Agency" htmlFor="agency-name">
      <Input id="agency-name" />
    </Field>,
  )
  expect(screen.getByLabelText("Agency")).toHaveAttribute("id", "agency-name")
})

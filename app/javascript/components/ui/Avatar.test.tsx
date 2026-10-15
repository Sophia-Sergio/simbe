import { render, screen } from "@testing-library/react"
import { Avatar, avatarTone, initials } from "./Avatar"

it("builds initials for full names, single names and empty names", () => {
  expect(initials("Erin Walsh")).toBe("EW")
  expect(initials("Dana")).toBe("D")
  expect(initials("")).toBe("?")
  expect(initials("  ")).toBe("?")
})

it("gives the same name the same tone", () => {
  expect(avatarTone("Erin Walsh")).toBe(avatarTone("Erin Walsh"))
  render(
    <>
      <Avatar name="Erin Walsh" />
      <Avatar name="Erin Walsh" />
    </>,
  )
  const [first, second] = screen.getAllByTitle("Erin Walsh")
  expect(first.className).toBe(second.className)
  expect(first).toHaveClass("rounded-full")
})

it("accepts an explicit tone and size", () => {
  render(<Avatar name="Dana Ortiz" tone="violet" size={44} />)
  const avatar = screen.getByTitle("Dana Ortiz")
  expect(avatar).toHaveClass("bg-violet-bg", "text-violet-text", "h-11")
  expect(avatar).toHaveTextContent("DO")
})

it("falls back to a question mark without a name", () => {
  render(<Avatar name="" />)
  expect(screen.getByText("?")).toBeInTheDocument()
})

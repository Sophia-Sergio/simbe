import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { NotFound } from "./NotFound"

it("renders a not-found message with a way home", () => {
  render(<NotFound />, { wrapper: MemoryRouter })
  expect(screen.getByRole("heading", { name: "Page not found" })).toBeInTheDocument()
  expect(screen.getByRole("link", { name: "Go home" })).toHaveAttribute("href", "/")
})

import { MemoryRouter } from "react-router-dom"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { KitGallery } from "./KitGallery"

it("collects and renders the sections it finds", () => {
  render(
    <MemoryRouter>
      <KitGallery />
    </MemoryRouter>,
  )
  expect(screen.getByRole("heading", { level: 1, name: "Kit" })).toBeInTheDocument()
  expect(screen.getByRole("heading", { name: "Primitives" })).toBeInTheDocument()
})

it("opens the modal and the sheet and fires a toast", async () => {
  render(
    <MemoryRouter>
      <KitGallery />
    </MemoryRouter>,
  )

  await userEvent.click(screen.getByRole("button", { name: "Open modal" }))
  expect(await screen.findByRole("dialog")).toHaveAttribute("data-variant", "modal")
  await userEvent.keyboard("{Escape}")
  expect(screen.queryByRole("dialog")).toBeNull()

  await userEvent.click(screen.getByRole("button", { name: "Open sheet" }))
  expect(await screen.findByRole("dialog")).toHaveAttribute("data-variant", "panel")
  await userEvent.click(screen.getByRole("button", { name: "Close" }))
  expect(screen.queryByRole("dialog")).toBeNull()

  await userEvent.click(screen.getByRole("button", { name: "Show toast" }))
  expect(await screen.findByTestId("toast")).toHaveTextContent("Saved")
})

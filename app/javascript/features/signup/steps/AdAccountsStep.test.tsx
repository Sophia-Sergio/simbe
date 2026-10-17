import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderWithProviders } from "@/test/renderWithProviders"
import { AdAccountsStep } from "./AdAccountsStep"

it("connects Meta and Google and turns each button into a green Connected pill", async () => {
  renderWithProviders(<AdAccountsStep />)

  expect(screen.getAllByText("Sample spend — live sync coming")).toHaveLength(2)

  await userEvent.click(screen.getAllByRole("button", { name: "Connect" })[0])
  expect(await screen.findByRole("button", { name: "Connected" })).toBeInTheDocument()

  await userEvent.click(screen.getByRole("button", { name: "Connect" }))
  await waitFor(() => expect(screen.getAllByRole("button", { name: "Connected" })).toHaveLength(2))
  expect(screen.queryByRole("button", { name: "Connect" })).not.toBeInTheDocument()
})

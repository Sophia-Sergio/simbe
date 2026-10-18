import { screen } from "@testing-library/react"
import { renderWithProviders } from "@/test/renderWithProviders"
import { AdAccountsStep } from "./AdAccountsStep"

it("shows Meta and Google as coming soon, with nothing to connect", () => {
  renderWithProviders(<AdAccountsStep />)

  expect(screen.getByText("Meta Ads")).toBeInTheDocument()
  expect(screen.getByText("Google Ads")).toBeInTheDocument()
  expect(screen.getAllByText("Coming soon")).toHaveLength(2)
  expect(screen.queryByRole("button")).not.toBeInTheDocument()
})

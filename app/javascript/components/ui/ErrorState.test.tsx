import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ErrorState } from "./ErrorState"

it("announces the message and retries through a Button", async () => {
  const onRetry = vi.fn()
  render(<ErrorState message="We could not reach the server." onRetry={onRetry} />)
  expect(screen.getByRole("alert")).toHaveTextContent("We could not reach the server.")
  await userEvent.click(screen.getByRole("button", { name: "Retry" }))
  expect(onRetry).toHaveBeenCalledTimes(1)
})

it("hides the retry button without a handler", () => {
  render(<ErrorState message="Nope" />)
  expect(screen.queryByRole("button", { name: "Retry" })).toBeNull()
})

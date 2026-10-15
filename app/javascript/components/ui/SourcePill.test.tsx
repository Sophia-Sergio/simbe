import { render, screen } from "@testing-library/react"
import { SourcePill } from "./SourcePill"

it("shows the channel name and its colour dot", () => {
  render(<SourcePill channel="Instagram" />)
  expect(screen.getByText("Instagram")).toBeInTheDocument()
  expect(screen.getByTestId("source-dot")).toHaveStyle({ backgroundColor: "#d62976" })
})

it("uses the Unknown colour for an unrecognised channel", () => {
  render(<SourcePill channel="TikTok Ad" />)
  expect(screen.getByTestId("source-dot")).toHaveStyle({ backgroundColor: "#a8a29e" })
})

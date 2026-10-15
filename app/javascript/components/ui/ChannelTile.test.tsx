import { render, screen } from "@testing-library/react"
import { ChannelTile, channelColor } from "./ChannelTile"

it("renders the channel initial on its placeholder colour", () => {
  render(<ChannelTile channel="Facebook" />)
  expect(screen.getByTitle("Facebook")).toHaveStyle({ backgroundColor: "#1877f2" })
  expect(screen.getByText("F")).toHaveAttribute("aria-hidden", "true")
})

it("falls back to the Unknown colour for an unrecognised channel", () => {
  expect(channelColor("Podcast")).toBe("#a8a29e")
  render(<ChannelTile channel="Podcast" />)
  expect(screen.getByTitle("Podcast")).toHaveStyle({ backgroundColor: "#a8a29e" })
})

it("carries the Meta placeholder colour", () => {
  expect(channelColor("Meta")).toBe("#0866ff")
})

it("supports the 36px and 38px sizes", () => {
  const { rerender } = render(<ChannelTile channel="Google" size={36} />)
  expect(screen.getByTitle("Google")).toHaveClass("h-9", "w-9")
  rerender(<ChannelTile channel="Google" size={38} />)
  expect(screen.getByTitle("Google")).toHaveClass("h-[38px]", "w-[38px]")
})

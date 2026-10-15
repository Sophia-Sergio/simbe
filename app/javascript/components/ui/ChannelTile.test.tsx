import { render, screen } from "@testing-library/react"
import { ChannelTile, channelColor } from "./ChannelTile"

it("renders the channel initial on its placeholder colour", () => {
  render(<ChannelTile channel="Facebook" />)
  expect(screen.getByText("F")).toHaveStyle({ backgroundColor: "#1877f2" })
})

it("falls back to the Unknown colour for an unrecognised channel", () => {
  expect(channelColor("Podcast")).toBe("#a8a29e")
  render(<ChannelTile channel="Podcast" />)
  expect(screen.getByText("P")).toHaveStyle({ backgroundColor: "#a8a29e" })
})

it("supports the 36px detail size", () => {
  render(<ChannelTile channel="Google" size={36} />)
  expect(screen.getByText("G")).toHaveClass("h-9", "w-9")
})

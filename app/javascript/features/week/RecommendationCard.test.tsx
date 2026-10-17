import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { Recommendation } from "@/api/types"
import { RecommendationCard } from "./RecommendationCard"

const rec: Recommendation = {
  id: "funnel_leak",
  area: "process",
  impact: "5 leads stalled",
  title: "Most leads stall before Application",
  why: "50.0% of leads never reach Application.",
  cta: { label: "Open funnel", route: "/funnel" },
  ask: { question: "Why do leads stall before the application?" },
  score: 5,
}

it("shows the area, impact, title and why", () => {
  render(<RecommendationCard rec={rec} onAsk={() => {}} onOpen={() => {}} />)
  expect(screen.getByText("Process")).toBeInTheDocument()
  expect(screen.getByText("5 leads stalled")).toBeInTheDocument()
  expect(screen.getByRole("heading", { name: "Most leads stall before Application" })).toBeInTheDocument()
  expect(screen.getByText(/never reach Application/)).toBeInTheDocument()
})

it("sends the preset question to the agent", async () => {
  const onAsk = vi.fn()
  render(<RecommendationCard rec={rec} onAsk={onAsk} onOpen={() => {}} />)
  await userEvent.click(screen.getByRole("button", { name: /ask why/i }))
  expect(onAsk).toHaveBeenCalledWith("Why do leads stall before the application?")
})

it("opens the target route", async () => {
  const onOpen = vi.fn()
  render(<RecommendationCard rec={rec} onAsk={() => {}} onOpen={onOpen} />)
  await userEvent.click(screen.getByRole("button", { name: "Open funnel" }))
  expect(onOpen).toHaveBeenCalledWith("/funnel")
})

it("colours the area pill by area", () => {
  const { rerender } = render(<RecommendationCard rec={{ ...rec, area: "ads" }} onAsk={() => {}} onOpen={() => {}} />)
  expect(screen.getByText("Ads")).toHaveClass("text-brand-text")
  rerender(<RecommendationCard rec={{ ...rec, area: "people" }} onAsk={() => {}} onOpen={() => {}} />)
  expect(screen.getByText("People")).toHaveClass("text-violet-text")
})

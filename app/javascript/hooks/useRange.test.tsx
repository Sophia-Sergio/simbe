import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, useLocation } from "react-router-dom"
import { useRange } from "./useRange"

function Probe() {
  const [range, setRange] = useRange()
  const location = useLocation()
  return (
    <div>
      <span data-testid="range">{range}</span>
      <span data-testid="search">{location.search}</span>
      <button onClick={() => setRange("90d")}>set</button>
    </div>
  )
}

function renderAt(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Probe />
    </MemoryRouter>,
  )
}

it("defaults to 30d when absent", () => {
  renderAt("/channels")
  expect(screen.getByTestId("range")).toHaveTextContent("30d")
})

it("falls back to 30d for a junk value without dropping other params", () => {
  renderAt("/funnel?range=zzz&utm=x")
  expect(screen.getByTestId("range")).toHaveTextContent("30d")
  expect(screen.getByTestId("search")).toHaveTextContent("range=zzz")
})

it("writes the range and preserves other params", async () => {
  renderAt("/funnel?range=30d&utm=x")
  await userEvent.click(screen.getByRole("button", { name: "set" }))
  const search = screen.getByTestId("search").textContent ?? ""
  expect(search).toContain("range=90d")
  expect(search).toContain("utm=x")
  expect(screen.getByTestId("range")).toHaveTextContent("90d")
})

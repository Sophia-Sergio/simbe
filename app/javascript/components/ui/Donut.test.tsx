import { render, screen } from "@testing-library/react"
import { Donut } from "./Donut"

const CIRCUMFERENCE = 2 * Math.PI * 40

it("keeps the plan's text alternative", () => {
  render(<Donut pct={27} label="27% stall" sublabel="stall" />)
  expect(screen.getByRole("img", { name: /27% stall/ })).toBeInTheDocument()
})

it("builds the accessible name from label and sublabel", () => {
  render(<Donut pct={27} label="27%" sublabel="stall" />)
  expect(screen.getByRole("img", { name: "27% stall" })).toBeInTheDocument()
})

it("hides the centre value from assistive tech so it is not read twice", () => {
  render(<Donut pct={27} label="27%" sublabel="stall" />)
  expect(screen.getByText("27%").closest('[aria-hidden="true"]')).not.toBeNull()
})

it("sizes the arc to the pct of the circumference", () => {
  const { container } = render(<Donut pct={27} label="27%" />)
  const arc = container.querySelector('[data-testid="arc"]') as SVGCircleElement
  expect(arc).toHaveAttribute("stroke-dasharray", `${(27 / 100) * CIRCUMFERENCE} ${CIRCUMFERENCE}`)
})

it("clamps out-of-range percentages", () => {
  const full = render(<Donut pct={150} label="100%" />)
  const fullArc = full.container.querySelector('[data-testid="arc"]') as SVGCircleElement
  expect(fullArc.getAttribute("stroke-dasharray")).toBe(`${CIRCUMFERENCE} ${CIRCUMFERENCE}`)

  const empty = render(<Donut pct={0} label="0%" />)
  const emptyArc = empty.container.querySelector('[data-testid="arc"]') as SVGCircleElement
  expect(emptyArc.getAttribute("stroke-dasharray")).toBe(`0 ${CIRCUMFERENCE}`)
})

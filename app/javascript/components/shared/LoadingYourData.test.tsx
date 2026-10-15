import { render, screen } from "@testing-library/react"
import { LoadingYourData } from "./LoadingYourData"

it("renders the loading title, the progress and no upload CTA", () => {
  render(<LoadingYourData progress={{ phase: "importing", pct: 46, rows_done: 24000, rows_total: 52000 }} />)
  expect(screen.getByText("Loading your data…")).toBeInTheDocument()
  expect(screen.getByRole("progressbar")).toBeInTheDocument()
  expect(screen.getByText("Importing rows (24,000 of 52,000)")).toBeInTheDocument()
  expect(screen.queryByRole("button", { name: /upload/i })).toBeNull()
  expect(screen.queryByRole("link", { name: /upload/i })).toBeNull()
})

it("falls back to the importing phase while the load has no phase", () => {
  render(<LoadingYourData progress={null} />)
  expect(screen.getByText("Importing rows")).toBeInTheDocument()
  expect(screen.queryByText("Uploading your files")).toBeNull()
})

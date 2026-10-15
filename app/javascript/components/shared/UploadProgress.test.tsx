import { render, screen } from "@testing-library/react"
import { UploadProgress } from "./UploadProgress"

it("prints the label for each phase", () => {
  const phases: [string, string][] = [
    ["storing", "Uploading your files"],
    ["parsing", "Reading your files"],
    ["validating", "Checking your data"],
    ["computing", "Building your insights"],
    ["finalizing", "Almost done"],
  ]
  for (const [phase, label] of phases) {
    const { unmount } = render(<UploadProgress status="committing" progress={{ phase, pct: 10 }} />)
    expect(screen.getByText(label)).toBeInTheDocument()
    unmount()
  }
})

it("prints the imported row count while importing", () => {
  render(<UploadProgress status="committing" progress={{ phase: "importing", pct: 46, rows_done: 24000, rows_total: 52000 }} />)
  expect(screen.getByText("Importing rows (24,000 of 52,000)")).toBeInTheDocument()
})

it("exposes a determinate progressbar with aria-valuenow", () => {
  render(<UploadProgress status="validating" progress={{ phase: "parsing", pct: 46 }} />)
  expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "46")
})

it("is indeterminate without a pct", () => {
  render(<UploadProgress status="validating" />)
  const bar = screen.getByRole("progressbar")
  expect(bar).not.toHaveAttribute("aria-valuenow")
  expect(screen.getByTestId("indeterminate")).toHaveClass("animate-pulse")
})

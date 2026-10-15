import { render, screen } from "@testing-library/react"
import uploadErrors from "@contracts/examples/snapshots/upload-errors.json"
import uploadOk from "@contracts/examples/snapshots/upload-ok.json"
import { ReviewReport } from "./ReviewReport"
import type { Report } from "./ReviewReport"

it("prints the green check rows for a valid upload", () => {
  render(<ReviewReport report={uploadOk.report as unknown as Report} agencyName="Harbor Surrogacy" />)
  expect(screen.getByText("Leads 3,530 → 3,611 (+81)")).toBeInTheDocument()
  expect(screen.getByText("Duplicate rows 0")).toBeInTheDocument()
  expect(screen.getByText("Files matched to Harbor Surrogacy 7 of 7")).toBeInTheDocument()
  expect(screen.getByText("Screener answers Encrypted")).toBeInTheDocument()
  expect(screen.getByText("79 extra leads share an email with another lead (kept separate) (79)")).toHaveClass(
    "text-warning-text",
  )
})

it("marks failed checks with danger styling", () => {
  render(<ReviewReport report={uploadErrors.report as unknown as Report} agencyName="Harbor Surrogacy" />)
  expect(screen.getByText("Duplicate rows 1")).toHaveClass("text-danger-text")
  expect(screen.getByText("Files matched to Harbor Surrogacy 6 of 7")).toHaveClass("text-danger-text")
  // upload-errors.json still has screener_encrypted: true, so that row stays a success.
  expect(screen.getByText("Screener answers Encrypted")).toHaveClass("text-ink-secondary")
})

it("marks an unencrypted screener check as a failure", () => {
  render(
    <ReviewReport
      report={
        {
          ok: true,
          errors: [],
          warnings: [],
          checks: { files_matched: "7 of 7", duplicates: 0, screener_encrypted: false },
        } as unknown as Report
      }
      agencyName="Beta"
    />,
  )
  const screener = screen.getByText("Screener answers Not encrypted")
  expect(screener).toHaveClass("text-danger-text")
  expect(screener.closest("li")?.querySelector(".lucide-circle-x")).not.toBeNull()
})

it("prints red error rows with the file and row", () => {
  render(<ReviewReport report={uploadErrors.report as unknown as Report} agencyName="Harbor Surrogacy" />)
  expect(screen.getByText(/stage_history\.csv row 12/)).toHaveClass("text-danger-text")
  expect(screen.getByText(/appointments\.csv/)).toHaveClass("text-danger-text")
})

it("renders safely without a diff or checks", () => {
  render(<ReviewReport report={{ ok: true, errors: [], warnings: [] }} agencyName="Beta" />)
  expect(screen.queryByText(/Leads/)).toBeNull()
})

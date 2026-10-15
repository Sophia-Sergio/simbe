import { render, screen } from "@testing-library/react"
import { EmptyState } from "./EmptyState"
import { Skeleton } from "./Skeleton"

it("renders the title, body and action", () => {
  render(
    <EmptyState title="No leads yet" body="Upload your exports to see leads here." action={<button>Upload</button>} />,
  )
  expect(screen.getByText("No leads yet")).toBeInTheDocument()
  expect(screen.getByText("Upload your exports to see leads here.")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Upload" })).toBeInTheDocument()
})

it("renders a skeleton-only body", () => {
  render(
    <EmptyState title="Loading" body={<Skeleton className="h-4 w-24" />} />,
  )
  expect(screen.getByTestId("skeleton")).toBeInTheDocument()
})

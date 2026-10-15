import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { restoreMatchMedia, setViewport } from "./test-utils"
import { Table } from "./Table"

type Row = { id: string; name: string; leads: number }

const columns = [
  { key: "name", header: "Channel" },
  { key: "leads", header: "Leads", align: "right" as const },
]
const rows: Row[] = [{ id: "1", name: "Facebook", leads: 3530 }]

afterEach(() => restoreMatchMedia())

it("activates a clickable row on click and on Enter", async () => {
  const onRowClick = vi.fn()
  render(<Table columns={columns} rows={rows} rowKey={(row) => row.id} onRowClick={onRowClick} />)
  const row = screen.getByRole("row", { name: /Facebook/ })
  await userEvent.click(row)
  expect(onRowClick).toHaveBeenCalledWith(expect.objectContaining({ id: "1" }))
  fireEvent.keyDown(row, { key: "Enter" })
  expect(onRowClick).toHaveBeenCalledTimes(2)
})

it("does not make rows focusable without onRowClick", () => {
  render(<Table columns={columns} rows={rows} rowKey={(row) => row.id} />)
  expect(screen.getByRole("row", { name: /Facebook/ })).not.toHaveAttribute("tabindex")
})

it("uses renderCard below 860px", () => {
  setViewport(390)
  render(
    <Table
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      renderCard={(row) => <span>card {row.name}</span>}
    />,
  )
  expect(screen.getByText("card Facebook")).toBeInTheDocument()
  expect(screen.queryByRole("table")).toBeNull()
})

it("shows the empty text when there are no rows", () => {
  render(<Table columns={columns} rows={[] as Row[]} rowKey={(row) => row.id} emptyText="Nothing here" />)
  expect(screen.getByText("Nothing here")).toBeInTheDocument()
})

it("renders an em dash for missing cell values", () => {
  render(<Table columns={columns} rows={[{ id: "2", name: "Referral", leads: null as unknown as number }]} rowKey={(row) => row.id} />)
  expect(screen.getByText("—")).toBeInTheDocument()
})

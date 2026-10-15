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

it("keeps the global focus ring on clickable rows", () => {
  render(<Table columns={columns} rows={rows} rowKey={(row) => row.id} onRowClick={() => {}} />)
  expect(screen.getByRole("row", { name: /Facebook/ }).className).not.toContain("focus:outline-none")
})

it("ignores a click or Enter on a nested control", async () => {
  const onRowClick = vi.fn()
  render(
    <Table
      columns={[{ key: "name", header: "Channel", render: () => <button type="button">act</button> }]}
      rows={rows}
      rowKey={(row) => row.id}
      onRowClick={onRowClick}
    />,
  )
  const control = screen.getByRole("button", { name: "act" })
  await userEvent.click(control)
  fireEvent.keyDown(control, { key: "Enter" })
  expect(onRowClick).not.toHaveBeenCalled()
})

it("opens a card below 860px when onRowClick is set", async () => {
  setViewport(390)
  const onRowClick = vi.fn()
  render(
    <Table
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      onRowClick={onRowClick}
      renderCard={(row) => <span>card {row.name}</span>}
    />,
  )
  await userEvent.click(screen.getByRole("button", { name: /card Facebook/ }))
  expect(onRowClick).toHaveBeenCalledWith(expect.objectContaining({ id: "1" }))
})

it("wraps the table so it can scroll horizontally instead of the page", () => {
  setViewport(390)
  render(<Table columns={columns} rows={rows} rowKey={(row) => row.id} />)
  expect(screen.getByRole("table").parentElement).toHaveClass("overflow-x-auto")
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

it("opens a clickable row when a plain cell is clicked (not only the row element itself)", async () => {
  const onRowClick = vi.fn()
  render(
    <Table
      columns={[{ key: "name", header: "Name" }]}
      rows={[{ name: "Facebook" }]}
      rowKey={(row) => row.name}
      onRowClick={onRowClick}
    />,
  )
  await userEvent.click(screen.getByRole("cell", { name: "Facebook" }))
  expect(onRowClick).toHaveBeenCalledTimes(1)
})
